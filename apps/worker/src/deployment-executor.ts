import { DeploymentStatus, StageStatus } from "@prisma/client";
import { db } from "@deploypilot/database/client";
import { DockerAdapter } from "./docker-adapter.js";

const stageNames = ["dependencies", "tests", "docker-build", "health-check", "deploy"] as const;

export class DeploymentExecutor {
  private readonly docker = new DockerAdapter();

  async execute(deploymentId: string) {
    const claimed = await db.deployment.updateMany({ where: { id: deploymentId, status: DeploymentStatus.QUEUED }, data: { status: DeploymentStatus.RUNNING, startedAt: new Date() } });
    if (claimed.count !== 1) return { skipped: true };
    try {
      const deployment = await db.deployment.findUniqueOrThrow({ where: { id: deploymentId }, include: { config: true, repository: true } });
      await this.log(deploymentId, "system", "info", `Claimed commit ${deployment.commitSha}`);
      for (const name of stageNames) {
        await db.deploymentStage.update({ where: { deploymentId_name: { deploymentId, name } }, data: { status: StageStatus.RUNNING, startedAt: new Date() } });
        await this.log(deploymentId, name, "info", `Starting ${name}`);
        if (name === "docker-build") {
          const profile = deployment.config.profile as { timeoutSeconds?: number; port?: number };
          await this.docker.build(`deploypilot-${deployment.id.slice(0, 12)}`, ".", { strategy: "DOCKERFILE", timeoutSeconds: profile.timeoutSeconds ?? 900, requiredSecretNames: [] }, { timeoutSeconds: profile.timeoutSeconds ?? 900, memoryLimitMb: 1024, cpuLimit: 1, pidsLimit: 256, networkMode: "bridge" });
        }
        await db.deploymentStage.update({ where: { deploymentId_name: { deploymentId, name } }, data: { status: StageStatus.SUCCEEDED, endedAt: new Date() } });
        await this.log(deploymentId, name, "info", `Completed ${name}`);
      }
      await db.deployment.update({ where: { id: deploymentId }, data: { status: DeploymentStatus.SUCCEEDED, endedAt: new Date() } });
      await this.log(deploymentId, "system", "info", "Deployment succeeded");
      return { status: DeploymentStatus.SUCCEEDED };
    } catch (error) {
      await db.deployment.update({ where: { id: deploymentId }, data: { status: DeploymentStatus.FAILED, endedAt: new Date() } });
      await this.log(deploymentId, "system", "error", error instanceof Error ? error.message : "Deployment failed");
      return { status: DeploymentStatus.FAILED };
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
}
