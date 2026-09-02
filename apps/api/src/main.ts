import "reflect-metadata";
import { BadRequestException, Body, Controller, Get, Injectable, Module, NotFoundException, Param, Post, Req, UnauthorizedException } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { createClient } from "@supabase/supabase-js";
import type { Request } from "express";
import { db } from "@deploypilot/database/client";
import { DeploymentTrigger } from "@prisma/client";
import { GitHubService } from "./github.service.js";
import { PrismaService } from "./prisma.service.js";
import { QueueService } from "./queue.service.js";
import { createWorkerToken, hashWorkerToken, workerTokenMatches } from "./worker-auth.js";

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
  constructor(private readonly auth: AuthService, private readonly github: GitHubService, private readonly prisma: PrismaService, private readonly queue: QueueService) {}

  @Get("/health")
  health() { return { service: "deploypilot-api", status: "ok", timestamp: new Date().toISOString() }; }

  @Get("/v1/github/installations/:installationId/repositories")
  async repositories(@Req() request: Request, @Param("installationId") installationId: string) {
    const user = await this.auth.user(request);
    const githubRepositories = await this.github.listRepositories(installationId);
    const installation = await db.gitHubInstallation.upsert({ where: { installationId }, update: { accountLogin: githubRepositories[0]?.full_name.split("/")[0] ?? "unknown" }, create: { userId: user.id, installationId, accountLogin: githubRepositories[0]?.full_name.split("/")[0] ?? "unknown" } });
    for (const repo of githubRepositories) {
      await db.repository.upsert({ where: { githubRepoId: String(repo.id) }, update: { fullName: repo.full_name, defaultBranch: repo.default_branch, ownerId: user.id, installationId: installation.id }, create: { githubRepoId: String(repo.id), fullName: repo.full_name, defaultBranch: repo.default_branch, ownerId: user.id, installationId: installation.id } });
    }
    return { repositories: await db.repository.findMany({ where: { ownerId: user.id }, orderBy: { fullName: "asc" } }) };
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
    const commitSha = body.sha ?? body.branch!;
    const deployment = await db.deployment.create({ data: { repositoryId, configId: config.id, environmentId: environment.id, targetWorkerId: body.workerId, commitSha, trigger: DeploymentTrigger.MANUAL, stages: { create: ["dependencies", "tests", "docker-build", "health-check", "deploy"].map((name) => ({ name })) } } });
    await this.queue.enqueue(deployment.id);
    return { id: deployment.id, status: deployment.status, commitSha: deployment.commitSha };
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

@Module({ controllers: [AppController], providers: [AuthService, GitHubService, PrismaService, QueueService] })
class AppModule {}

const app = await NestFactory.create(AppModule);
app.enableCors({ origin: true, credentials: true });
await app.listen(Number(process.env.API_PORT ?? 4000), "0.0.0.0");
