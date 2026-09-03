import { DeploymentStatus, StageStatus } from "@prisma/client";
import { db } from "@deploypilot/database/client";
import { DockerAdapter, DockerExecutionCancelledError } from "./docker-adapter.js";

const stageNames = ["dependencies", "tests", "docker-build", "health-check", "deploy"] as const;

export class DeploymentExecutor {
  private readonly docker = new DockerAdapter();

  async execute(deploymentId: string) {
    const claimed = await db.deployment.updateMany({ where: { id: deploymentId, status: DeploymentStatus.QUEUED }, data: { status: DeploymentStatus.RUNNING, startedAt: new Date() } });
    if (claimed.count !== 1) return { skipped: true };

    const cancellation = new AbortController();
    const cancellationMonitor = setInterval(() => {
      void db.deployment.findUnique({ where: { id: deploymentId }, select: { status: true } }).then((deployment) => {
        if (deployment?.status === DeploymentStatus.CANCELLED) cancellation.abort();
      }).catch(() => undefined);
    }, 1_000);

    try {
      const deployment = await db.deployment.findUniqueOrThrow({ where: { id: deploymentId }, include: { config: true, repository: true } });
      await this.throwIfCancelled(deploymentId, cancellation);
      await this.event(deploymentId, "deployment.status", { deploymentId, status: DeploymentStatus.RUNNING });
      await this.log(deploymentId, "system", "info", `Claimed commit ${deployment.commitSha}`);

      for (const name of stageNames) {
        await this.throwIfCancelled(deploymentId, cancellation);
        const startedAt = new Date();
        await db.deploymentStage.update({ where: { deploymentId_name: { deploymentId, name } }, data: { status: StageStatus.RUNNING, startedAt } });
        await this.event(deploymentId, "stage.updated", { deploymentId, stage: name, status: StageStatus.RUNNING, startedAt });
        await this.log(deploymentId, name, "info", `Starting ${name}`);

        if (name === "docker-build") {
          const profile = deployment.config.profile as { timeoutSeconds?: number };
          await this.docker.build(
            `deploypilot-${deployment.id.slice(0, 12)}`,
            ".",
            { strategy: "DOCKERFILE", timeoutSeconds: profile.timeoutSeconds ?? 900, requiredSecretNames: [] },
            { timeoutSeconds: profile.timeoutSeconds ?? 900, memoryLimitMb: 1024, cpuLimit: 1, pidsLimit: 256, networkMode: "bridge" },
            cancellation.signal,
          );
        }

        await this.throwIfCancelled(deploymentId, cancellation);
        const endedAt = new Date();
        await db.deploymentStage.update({ where: { deploymentId_name: { deploymentId, name } }, data: { status: StageStatus.SUCCEEDED, endedAt } });
        await this.event(deploymentId, "stage.updated", { deploymentId, stage: name, status: StageStatus.SUCCEEDED, startedAt, endedAt });
        await this.log(deploymentId, name, "info", `Completed ${name}`);
      }

      await this.throwIfCancelled(deploymentId, cancellation);
      const finalized = await db.deployment.updateMany({ where: { id: deploymentId, status: DeploymentStatus.RUNNING }, data: { status: DeploymentStatus.SUCCEEDED, endedAt: new Date() } });
      if (finalized.count !== 1) return { status: DeploymentStatus.CANCELLED };
      await this.event(deploymentId, "deployment.status", { deploymentId, status: DeploymentStatus.SUCCEEDED });
      await this.log(deploymentId, "system", "info", "Deployment succeeded");
      return { status: DeploymentStatus.SUCCEEDED };
    } catch (error) {
      if (error instanceof DockerExecutionCancelledError || cancellation.signal.aborted || await this.isCancelled(deploymentId)) {
        await this.markCancelled(deploymentId);
        return { status: DeploymentStatus.CANCELLED };
      }

      const message = error instanceof Error ? error.message : "Deployment failed";
      const status = message.includes("timed out") ? DeploymentStatus.TIMED_OUT : DeploymentStatus.FAILED;
      const activeStage = await db.deploymentStage.findFirst({ where: { deploymentId, status: StageStatus.RUNNING }, select: { name: true } });
      if (activeStage) {
        const endedAt = new Date();
        await db.deploymentStage.update({ where: { deploymentId_name: { deploymentId, name: activeStage.name } }, data: { status: StageStatus.FAILED, endedAt } });
        await this.event(deploymentId, "stage.updated", { deploymentId, stage: activeStage.name, status: StageStatus.FAILED, endedAt });
      }
      const finalized = await db.deployment.updateMany({ where: { id: deploymentId, status: DeploymentStatus.RUNNING }, data: { status, endedAt: new Date() } });
      if (finalized.count === 1) {
        await this.event(deploymentId, "deployment.status", { deploymentId, status });
        await this.log(deploymentId, "system", "error", message);
      }
      return { status };
    } finally {
      clearInterval(cancellationMonitor);
    }
  }

  private async throwIfCancelled(deploymentId: string, cancellation: AbortController) {
    if (cancellation.signal.aborted || await this.isCancelled(deploymentId)) {
      cancellation.abort();
      throw new DockerExecutionCancelledError();
    }
  }

  private async isCancelled(deploymentId: string) {
    const deployment = await db.deployment.findUnique({ where: { id: deploymentId }, select: { status: true } });
    return deployment?.status === DeploymentStatus.CANCELLED;
  }

  private async markCancelled(deploymentId: string) {
    const stage = await db.deploymentStage.findFirst({ where: { deploymentId, status: StageStatus.RUNNING }, select: { name: true } });
    if (stage) {
      const endedAt = new Date();
      await db.deploymentStage.update({ where: { deploymentId_name: { deploymentId, name: stage.name } }, data: { status: StageStatus.FAILED, endedAt } });
      await this.event(deploymentId, "stage.updated", { deploymentId, stage: stage.name, status: StageStatus.FAILED, endedAt, reason: "cancelled" });
    }
    const finalized = await db.deployment.updateMany({ where: { id: deploymentId, status: { in: [DeploymentStatus.RUNNING, DeploymentStatus.QUEUED] } }, data: { status: DeploymentStatus.CANCELLED, endedAt: new Date() } });
    if (finalized.count === 1) {
      await this.event(deploymentId, "deployment.status", { deploymentId, status: DeploymentStatus.CANCELLED });
      await this.log(deploymentId, "system", "warn", "Deployment cancelled by user");
    }
  }

  private async log(deploymentId: string, stage: string, level: string, message: string) {
    const last = await db.deploymentLog.findFirst({ where: { deploymentId }, orderBy: { sequence: "desc" }, select: { sequence: true } });
    const sequence = (last?.sequence ?? 0) + 1;
    await db.$transaction([
      db.deploymentLog.create({ data: { deploymentId, sequence, stage, level, message } }),
      db.deploymentEvent.create({ data: { deploymentId, type: "log.appended", payload: { sequence, stage, level, message } } }),
    ]);
  }

  private async event(deploymentId: string, type: string, payload: Record<string, unknown>) {
    await db.deploymentEvent.create({ data: { deploymentId, type, payload: payload as object } });
  }
}
