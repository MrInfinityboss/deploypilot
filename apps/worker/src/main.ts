import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { DeploymentExecutor } from "./deployment-executor.js";

const redisUrl = new URL(process.env.REDIS_URL ?? "redis://localhost:6379");
const connection = new Redis({ host: redisUrl.hostname, port: Number(redisUrl.port || 6379), password: redisUrl.password || undefined, maxRetriesPerRequest: null });
const executor = new DeploymentExecutor();

const worker = new Worker("deployments", async (job) => {
  if (!job.data?.deploymentId) throw new Error("Deployment job is missing deploymentId");
  return executor.execute(job.data.deploymentId as string);
}, { connection, concurrency: 1 });

worker.on("completed", (job) => console.log(`[worker] completed ${job.id}`));
worker.on("failed", (job, error) => console.error(`[worker] failed ${job?.id}`, error));
console.log("DeployPilot worker online");
