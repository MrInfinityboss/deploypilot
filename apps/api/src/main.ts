import dotenv from "dotenv";
import "reflect-metadata";
dotenv.config({ path: new URL("../../../.env", import.meta.url) });
import { BadRequestException, Body, Controller, Get, Inject, Injectable, Module, NotFoundException, Param, Post, Req, Sse, UnauthorizedException } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { createClient } from "@supabase/supabase-js";
import type { Request } from "express";
import { json } from "express";
import { Observable } from "rxjs";
import { db } from "@deploypilot/database/client";
import { DeploymentStatus, DeploymentTrigger } from "@prisma/client";
import { GitHubService } from "./github.service.js";
import { PrismaService } from "./prisma.service.js";
import { QueueService } from "./queue.service.js";
import { createWorkerToken, hashWorkerToken, workerTokenMatches } from "./worker-auth.js";
import { branchFromRef, verifyGitHubSignature, type PushPayload } from "./github-webhook.js";
import { DiagnosisService } from "./diagnosis.service.js";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "");

@Injectable()
class AuthService {
  async user(request: Request) {
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) throw new UnauthorizedException();
    const { data, error } = await supabase.auth.getUser(authorization.slice(7));
    if (error || !data.user || !data.user.email) throw new UnauthorizedException();
    return db.user.upsert({ where: { supabaseId: data.user.id }, update: { email: data.user.email, displayName: data.user.user_metadata?.user_name ?? data.user.email }, create: { supabaseId: data.user.id, email: data.user.email, displayName: data.user.user_metadata?.user_name ?? data.user.email } });
  }
}

@Controller()
class AppController {
  constructor(@Inject(AuthService) private readonly auth: AuthService, @Inject(GitHubService) private readonly github: GitHubService, @Inject(PrismaService) private readonly prisma: PrismaService, @Inject(QueueService) private readonly queue: QueueService, @Inject(DiagnosisService) private readonly diagnosis: DiagnosisService) {}

  @Get("/health") health() { return { service: "deploypilot-api", status: "ok", timestamp: new Date().toISOString() }; }

  @Get("/v1/repositories")
  async allRepositories(@Req() request: Request) {
    const user = await this.auth.user(request);
    return { repositories: await db.repository.findMany({ where: { ownerId: user.id }, orderBy: { fullName: "asc" } }) };
  }

  @Get("/v1/github/installations/:installationId/repositories")
  async repositories(@Req() request: Request, @Param("installationId") installationId: string) {
    const user = await this.auth.user(request);
    const githubRepositories = await this.github.listRepositories(installationId);
    const installation = await db.gitHubInstallation.upsert({ where: { installationId }, update: { accountLogin: githubRepositories[0]?.full_name.split("/")[0] ?? "unknown" }, create: { userId: user.id, installationId, accountLogin: githubRepositories[0]?.full_name.split("/")[0] ?? "unknown" } });
    for (const repo of githubRepositories) await db.repository.upsert({ where: { githubRepoId: String(repo.id) }, update: { fullName: repo.full_name, defaultBranch: repo.default_branch, ownerId: user.id, installationId: installation.id }, create: { githubRepoId: String(repo.id), fullName: repo.full_name, defaultBranch: repo.default_branch, ownerId: user.id, installationId: installation.id } });
    return { repositories: await db.repository.findMany({ where: { ownerId: user.id }, orderBy: { fullName: "asc" } }) };
  }

  @Get("/v1/repositories/:repositoryId/setup")
  async repositorySetup(@Req() request: Request, @Param("repositoryId") repositoryId: string) {
    const user = await this.auth.user(request);
    const repository = await db.repository.findFirst({ where: { id: repositoryId, ownerId: user.id }, include: { configs: true, environments: true, workers: { select: { id: true, name: true, version: true, lastSeenAt: true, revokedAt: true } } } });
    if (!repository) throw new NotFoundException("Repository not found");
    return repository;
  }

  @Post("/v1/repositories/:repositoryId/configs")
  async createConfig(@Req() request: Request, @Param("repositoryId") repositoryId: string, @Body() body: { branchRule?: string; profile?: Record<string, unknown> }) {
    const user = await this.auth.user(request);
    const repository = await db.repository.findFirst({ where: { id: repositoryId, ownerId: user.id }, select: { id: true } });
    if (!repository) throw new NotFoundException("Repository not found");
    const profile = body.profile ?? { strategy: "DOCKERFILE", timeoutSeconds: 900, requiredSecretNames: [] };
    return db.deploymentConfig.create({ data: { repositoryId, branchRule: body.branchRule ?? "main", profile: profile as object, version: 1 } });
  }

  @Post("/v1/repositories/:repositoryId/environments")
  async createEnvironment(@Req() request: Request, @Param("repositoryId") repositoryId: string, @Body() body: { name?: string; url?: string }) {
    const user = await this.auth.user(request);
    if (!body.name) throw new BadRequestException("Environment name is required");
    const repository = await db.repository.findFirst({ where: { id: repositoryId, ownerId: user.id }, select: { id: true } });
    if (!repository) throw new NotFoundException("Repository not found");
    return db.environment.create({ data: { repositoryId, name: body.name, url: body.url, policy: { allowedWorkers: [] } } });
  }

  @Post("/v1/repositories/:repositoryId/deployments")
  async createDeployment(@Req() request: Request, @Param("repositoryId") repositoryId: string, @Body() body: { branch?: string; sha?: string; configId: string; environmentId: string; workerId: string }) {
    const user = await this.auth.user(request);
    if (!body.configId || !body.environmentId || !body.workerId || (!body.branch && !body.sha)) throw new BadRequestException("configId, environmentId, workerId, and branch or sha are required");
    const repository = await db.repository.findFirst({ where: { id: repositoryId, ownerId: user.id }, include: { configs: true, environments: true } });
    if (!repository) throw new NotFoundException("Repository not found");
    const config = repository.configs.find((item) => item.id === body.configId);
    const environment = repository.environments.find((item) => item.id === body.environmentId);
    if (!config || !environment) throw new BadRequestException("Configuration or environment does not belong to repository");
    const deployment = await db.deployment.create({ data: { repositoryId, configId: config.id, environmentId: environment.id, targetWorkerId: body.workerId, commitSha: body.sha ?? body.branch!, trigger: DeploymentTrigger.MANUAL, stages: { create: ["dependencies", "tests", "docker-build", "health-check", "deploy"].map((name) => ({ name })) } } });
    await this.queue.enqueue(deployment.id);
    return { id: deployment.id, status: deployment.status, commitSha: deployment.commitSha };
  }

  @Get("/v1/repositories/:repositoryId/deployments")
  async deploymentHistory(@Req() request: Request, @Param("repositoryId") repositoryId: string) {
    const user = await this.auth.user(request);
    const repository = await db.repository.findFirst({ where: { id: repositoryId, ownerId: user.id }, select: { id: true } });
    if (!repository) throw new NotFoundException("Repository not found");
    return { deployments: await db.deployment.findMany({ where: { repositoryId }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, commitSha: true, status: true, trigger: true, createdAt: true, startedAt: true, endedAt: true, targetWorkerId: true, environment: { select: { name: true, url: true } } } }) };
  }

  @Get("/v1/deployments/:deploymentId")
  async deployment(@Req() request: Request, @Param("deploymentId") deploymentId: string) {
    const user = await this.auth.user(request);
    const result = await db.deployment.findFirst({ where: { id: deploymentId, repository: { ownerId: user.id } }, include: { stages: true, repository: true, config: true, environment: true } });
    if (!result) throw new NotFoundException("Deployment not found");
    return result;
  }

  @Get("/v1/deployments/latest")
  async latestDeployment(@Req() request: Request) {
    const user = await this.auth.user(request);
    const result = await db.deployment.findFirst({ where: { repository: { ownerId: user.id } }, orderBy: { createdAt: "desc" }, select: { id: true, status: true, commitSha: true, createdAt: true } });
    if (!result) throw new NotFoundException("No deployment found");
    return result;
  }

  @Get("/v1/deployments/:deploymentId/logs")
  async logs(@Req() request: Request, @Param("deploymentId") deploymentId: string) {
    const user = await this.auth.user(request);
    const cursor = Number(request.query.cursor ?? 0);
    const limit = Math.min(Number(request.query.limit ?? 200), 500);
    const deployment = await db.deployment.findFirst({ where: { id: deploymentId, repository: { ownerId: user.id } }, select: { id: true } });
    if (!deployment) throw new NotFoundException("Deployment not found");
    const logs = await db.deploymentLog.findMany({ where: { deploymentId, sequence: { gt: cursor } }, orderBy: { sequence: "asc" }, take: limit });
    return { logs, nextCursor: logs.at(-1)?.sequence ?? cursor, hasMore: logs.length === limit };
  }

  @Post("/v1/deployments/:deploymentId/cancel")
  async cancel(@Req() request: Request, @Param("deploymentId") deploymentId: string) {
    const user = await this.auth.user(request);
    const result = await db.deployment.updateMany({ where: { id: deploymentId, status: { in: [DeploymentStatus.QUEUED, DeploymentStatus.RUNNING] }, repository: { ownerId: user.id } }, data: { status: DeploymentStatus.CANCELLED, endedAt: new Date() } });
    if (result.count !== 1) throw new NotFoundException("Active deployment not found");
    return { id: deploymentId, status: DeploymentStatus.CANCELLED };
  }

  @Post("/v1/deployments/:deploymentId/retry")
  async retry(@Req() request: Request, @Param("deploymentId") deploymentId: string) {
    const user = await this.auth.user(request);
    const previous = await db.deployment.findFirst({ where: { id: deploymentId, status: DeploymentStatus.FAILED, repository: { ownerId: user.id } }, include: { repository: { include: { configs: true, environments: true, workers: true } } } });
    if (!previous) throw new NotFoundException("Failed deployment not found");
    const config = previous.repository.configs.find((item) => item.id === previous.configId);
    const environment = previous.repository.environments.find((item) => item.id === previous.environmentId);
    const worker = previous.repository.workers.find((item) => item.id === previous.targetWorkerId && !item.revokedAt);
    if (!config || !environment || !worker) throw new BadRequestException("Deployment target is no longer available");
    const deployment = await db.deployment.create({ data: { repositoryId: previous.repositoryId, configId: config.id, environmentId: environment.id, targetWorkerId: worker.id, commitSha: previous.commitSha, trigger: DeploymentTrigger.RETRY, stages: { create: ["dependencies", "tests", "docker-build", "health-check", "deploy"].map((name) => ({ name })) } } });
    await this.queue.enqueue(deployment.id);
    return { id: deployment.id, status: deployment.status, commitSha: deployment.commitSha, retriedFrom: deploymentId };
  }

  @Post("/v1/deployments/:deploymentId/diagnose")
  async diagnose(@Req() request: Request, @Param("deploymentId") deploymentId: string) {
    const user = await this.auth.user(request);
    const deployment = await db.deployment.findFirst({ where: { id: deploymentId, repository: { ownerId: user.id }, status: DeploymentStatus.FAILED }, select: { id: true } });
    if (!deployment) throw new NotFoundException("Failed deployment not found");
    return this.diagnosis.diagnose(deploymentId);
  }

  @Sse("/v1/deployments/:deploymentId/events")
  async events(@Req() request: Request, @Param("deploymentId") deploymentId: string) {
    const accessToken = typeof request.query.access_token === "string" ? request.query.access_token : undefined;
    const authRequest = accessToken ? { ...request, headers: { ...request.headers, authorization: `Bearer ${accessToken}` } } as Request : request;
    const user = await this.auth.user(authRequest);
    const authorized = await db.deployment.findFirst({ where: { id: deploymentId, repository: { ownerId: user.id } }, select: { id: true } });
    if (!authorized) throw new NotFoundException("Deployment not found");
    const lastEventAt = request.headers["last-event-id"] ? new Date(Number(request.headers["last-event-id"])) : new Date(0);
    return new Observable<{ id: string; type: string; data: unknown }>((subscriber) => {
      let closed = false;
      const emit = async () => {
        const deployment = await db.deployment.findFirst({ where: { id: deploymentId }, select: { id: true, status: true, endedAt: true } });
        if (!deployment) return;
        const events = await db.deploymentEvent.findMany({ where: { deploymentId, createdAt: { gt: lastEventAt } }, orderBy: { createdAt: "asc" }, take: 100 });
        for (const event of events) subscriber.next({ id: String(event.createdAt.getTime()), type: event.type, data: event.payload });
        if (deployment.status !== DeploymentStatus.QUEUED && deployment.status !== DeploymentStatus.RUNNING) subscriber.next({ id: String(Date.now()), type: "deployment.completed", data: { deploymentId, status: deployment.status, endedAt: deployment.endedAt } });
      };
      void emit();
      const timer = setInterval(() => { if (!closed) void emit(); }, 1000);
      return () => { closed = true; clearInterval(timer); };
    });
  }

  @Post("/webhooks/github")
  async githubWebhook(@Req() request: Request, @Body() payload: PushPayload) {
    const rawBody = (request as Request & { rawBody?: Buffer }).rawBody;
    if (!rawBody || !verifyGitHubSignature(rawBody, request.headers["x-hub-signature-256"] as string | undefined, process.env.GITHUB_WEBHOOK_SECRET)) throw new UnauthorizedException("Invalid GitHub webhook signature");
    const deliveryId = request.headers["x-github-delivery"] as string | undefined;
    if (!deliveryId || !payload.repository?.id || !payload.after) throw new BadRequestException("Invalid GitHub push payload");
    const existing = await db.webhookDelivery.findUnique({ where: { deliveryId } });
    if (existing) return { accepted: true, duplicate: true };
    await db.webhookDelivery.create({ data: { deliveryId, event: "push" } });
    const branch = branchFromRef(payload.ref);
    const repository = await db.repository.findFirst({ where: { githubRepoId: String(payload.repository.id) }, include: { configs: true, environments: true, workers: true } });
    const config = repository?.configs.find((item) => !branch || item.branchRule === branch || item.branchRule === "*");
    const environment = repository?.environments[0];
    const worker = repository?.workers.find((item) => !item.revokedAt);
    if (!repository || !config || !environment || !worker) return { accepted: true, ignored: true, reason: "Repository has no complete deployment configuration" };
    const deployment = await db.deployment.create({ data: { repositoryId: repository.id, configId: config.id, environmentId: environment.id, targetWorkerId: worker.id, commitSha: payload.after, trigger: DeploymentTrigger.PUSH, stages: { create: ["dependencies", "tests", "docker-build", "health-check", "deploy"].map((name) => ({ name })) } } });
    await this.queue.enqueue(deployment.id);
    await db.webhookDelivery.update({ where: { deliveryId }, data: { processedAt: new Date(), outcome: "deployment-created" } });
    return { accepted: true, deploymentId: deployment.id };
  }

  @Post("/v1/repositories/:repositoryId/workers/register")
  async registerWorker(@Req() request: Request, @Param("repositoryId") repositoryId: string, @Body() body: { name: string; version: string; maxConcurrency?: number }) {
    const user = await this.auth.user(request);
    if (!body.name || !body.version) throw new BadRequestException("name and version are required");
    const repository = await db.repository.findFirst({ where: { id: repositoryId, ownerId: user.id } });
    if (!repository) throw new NotFoundException("Repository not found");
    const token = createWorkerToken();
    const worker = await db.worker.create({ data: { repositoryId, name: body.name, version: body.version, tokenHash: hashWorkerToken(token), capabilities: { docker: true, maxConcurrency: Math.min(body.maxConcurrency ?? 1, 2) } } });
    return { workerId: worker.id, token, warning: "Store this token securely. It will not be shown again." };
  }

  @Get("/v1/repositories/:repositoryId/workers")
  async workers(@Req() request: Request, @Param("repositoryId") repositoryId: string) {
    const user = await this.auth.user(request);
    const repository = await db.repository.findFirst({ where: { id: repositoryId, ownerId: user.id }, select: { id: true } });
    if (!repository) throw new NotFoundException("Repository not found");
    return { workers: await db.worker.findMany({ where: { repositoryId }, select: { id: true, name: true, version: true, capabilities: true, lastSeenAt: true, revokedAt: true, createdAt: true }, orderBy: { createdAt: "desc" } }) };
  }

  @Post("/v1/workers/:workerId/revoke")
  async revokeWorker(@Req() request: Request, @Param("workerId") workerId: string) {
    const user = await this.auth.user(request);
    const worker = await db.worker.findFirst({ where: { id: workerId, repository: { ownerId: user.id } } });
    if (!worker) throw new NotFoundException("Worker not found");
    await db.worker.update({ where: { id: workerId }, data: { revokedAt: new Date() } });
    return { workerId, status: "REVOKED" };
  }

  @Post("/v1/workers/:workerId/heartbeat")
  async heartbeat(@Req() request: Request, @Param("workerId") workerId: string, @Body() body: { version?: string }) {
    const authorization = request.headers.authorization;
    const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
    const worker = await db.worker.findUnique({ where: { id: workerId } });
    if (!worker || worker.revokedAt || !workerTokenMatches(token, worker.tokenHash)) throw new UnauthorizedException();
    const updated = await db.worker.update({ where: { id: workerId }, data: { lastSeenAt: new Date(), version: body.version ?? worker.version } });
    return { workerId: updated.id, status: "ONLINE", lastSeenAt: updated.lastSeenAt };
  }
}

@Module({ controllers: [AppController], providers: [AuthService, GitHubService, PrismaService, QueueService, DiagnosisService] })
class AppModule {}

const app = await NestFactory.create(AppModule);
app.use(json({ verify: (request, _response, buffer) => { (request as Request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer); } }));
app.enableCors({ origin: true, credentials: true });
await app.listen(Number(process.env.API_PORT ?? 4000), "0.0.0.0");
