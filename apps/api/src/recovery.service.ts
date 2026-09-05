import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { DeploymentStatus, StageStatus } from "@prisma/client";
import { db } from "@deploypilot/database/client";

const RECOVERY_INTERVAL_MS = 30_000;
const STALE_WORKER_MS = 120_000;
const MIN_DEPLOYMENT_AGE_MS = 300_000;

@Injectable()
export class RecoveryService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;

  onModuleInit() {
    this.timer = setInterval(() => void this.recoverStuckDeployments(), RECOVERY_INTERVAL_MS);
    void this.recoverStuckDeployments();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async recoverStuckDeployments() {
    const cutoff = new Date(Date.now() - STALE_WORKER_MS);
    const ageCutoff = new Date(Date.now() - MIN_DEPLOYMENT_AGE_MS);
    const candidates = await db.deployment.findMany({ where: { status: DeploymentStatus.RUNNING, startedAt: { lt: ageCutoff }, targetWorkerId: { not: null } }, select: { id: true, targetWorkerId: true }, take: 25 });
    const workerIds = candidates.map((candidate) => candidate.targetWorkerId).filter((id): id is string => Boolean(id));
    const workers = await db.worker.findMany({ where: { id: { in: workerIds }, lastSeenAt: { lt: cutoff } }, select: { id: true } });
    const staleWorkers = new Set(workers.map((worker) => worker.id));
    for (const candidate of candidates) {
      if (!candidate.targetWorkerId || !staleWorkers.has(candidate.targetWorkerId)) continue;
      const endedAt = new Date();
      const finalized = await db.deployment.updateMany({ where: { id: candidate.id, status: DeploymentStatus.RUNNING }, data: { status: DeploymentStatus.TIMED_OUT, endedAt } });
      if (finalized.count !== 1) continue;
      await db.deploymentStage.updateMany({ where: { deploymentId: candidate.id, status: StageStatus.RUNNING }, data: { status: StageStatus.FAILED, endedAt } });
      const last = await db.deploymentLog.findFirst({ where: { deploymentId: candidate.id }, orderBy: { sequence: "desc" }, select: { sequence: true } });
      const sequence = (last?.sequence ?? 0) + 1;
      await db.$transaction([
        db.deploymentLog.create({ data: { deploymentId: candidate.id, sequence, stage: "system", level: "error", message: "Deployment timed out because the worker heartbeat was lost." } }),
        db.deploymentEvent.create({ data: { deploymentId: candidate.id, type: "deployment.status", payload: { deploymentId: candidate.id, status: DeploymentStatus.TIMED_OUT, reason: "worker-heartbeat-timeout" } } }),
        db.deploymentEvent.create({ data: { deploymentId: candidate.id, type: "log.appended", payload: { sequence, stage: "system", level: "error", message: "Deployment timed out because the worker heartbeat was lost." } } }),
      ]);
    }
  }
}
