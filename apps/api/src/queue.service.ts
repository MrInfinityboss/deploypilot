import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { DeploymentStatus } from "@prisma/client";
import { db } from "@deploypilot/database/client";

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly connection = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", { maxRetriesPerRequest: null });
  private readonly deployments = new Queue("deployments", { connection: this.connection });

  async enqueue(deploymentId: string) {
    await this.deployments.add("deployment", { deploymentId }, { jobId: deploymentId, attempts: 3, backoff: { type: "exponential", delay: 2000 }, removeOnComplete: 100, removeOnFail: 500 });
  }

  async reconcileFailed(deploymentId: string) {
    const job = await this.deployments.getJob(deploymentId);
    if (!job || await job.getState() !== "failed") return false;
    const finalized = await db.deployment.updateMany({ where: { id: deploymentId, status: DeploymentStatus.QUEUED }, data: { status: DeploymentStatus.FAILED, endedAt: new Date() } });
    if (finalized.count !== 1) return false;
    const last = await db.deploymentLog.findFirst({ where: { deploymentId }, orderBy: { sequence: "desc" }, select: { sequence: true } });
    const sequence = (last?.sequence ?? 0) + 1;
    const message = `Deployment failed in the worker queue: ${job.failedReason ?? "worker execution error"}`;
    await db.$transaction([
      db.deploymentLog.create({ data: { deploymentId, sequence, stage: "system", level: "error", message } }),
      db.deploymentEvent.create({ data: { deploymentId, type: "deployment.status", payload: { deploymentId, status: DeploymentStatus.FAILED, reason: "queue-job-failed" } } }),
      db.deploymentEvent.create({ data: { deploymentId, type: "log.appended", payload: { sequence, stage: "system", level: "error", message } } }),
    ]);
    return true;
  }

  async ready() { return (await this.connection.ping()) === "PONG"; }

  async onModuleDestroy() { await this.deployments.close(); await this.connection.quit(); }
}
