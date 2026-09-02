import "reflect-metadata";
import { Body, Controller, Get, Injectable, Module, Param, Post, Req, UnauthorizedException } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { createClient } from "@supabase/supabase-js";
import type { Request } from "express";
import { GitHubService } from "./github.service.js";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "");

@Injectable()
class AuthService {
  async user(request: Request) {
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) throw new UnauthorizedException();
    const { data, error } = await supabase.auth.getUser(authorization.slice(7));
    if (error || !data.user) throw new UnauthorizedException();
    return data.user;
  }
}

@Controller()
class AppController {
  constructor(private readonly auth: AuthService, private readonly github: GitHubService) {}

  @Get("/health")
  health() { return { service: "deploypilot-api", status: "ok", timestamp: new Date().toISOString() }; }

  @Get("/v1/github/installations/:installationId/repositories")
  async repositories(@Req() request: Request, @Param("installationId") installationId: string) {
    const user = await this.auth.user(request);
    const repositories = await this.github.listRepositories(installationId);
    return { userId: user.id, installationId, repositories };
  }

  @Post("/v1/repositories/:repositoryId/deployments")
  async createDeployment(@Req() request: Request, @Param("repositoryId") repositoryId: string, @Body() body: { branch?: string; sha?: string; configId: string; environmentId: string; workerId: string }) {
    const user = await this.auth.user(request);
    if (!body.configId || !body.environmentId || !body.workerId || (!body.branch && !body.sha)) {
      return { error: "configId, environmentId, workerId, and branch or sha are required" };
    }
    return {
      accepted: true,
      status: "QUEUED",
      repositoryId,
      requestedBy: user.id,
      source: body.sha ? { commitSha: body.sha, immutable: true } : { branch: body.branch, immutable: false, resolution: "worker-or-api" },
      configId: body.configId,
      environmentId: body.environmentId,
      workerId: body.workerId,
    };
  }
}

@Module({ controllers: [AppController], providers: [AuthService, GitHubService] })
class AppModule {}

const app = await NestFactory.create(AppModule);
app.enableCors({ origin: true, credentials: true });
await app.listen(Number(process.env.API_PORT ?? 4000), "0.0.0.0");
