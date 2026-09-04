import dotenv from "dotenv";
import { Worker } from "bullmq";
dotenv.config({ path: new URL("../../../.env", import.meta.url) });
import { Redis } from "ioredis";
import { DeploymentExecutor } from "./deployment-executor.js";
import { sendHeartbeat } from "./heartbeat.js";

const apiUrl = process.env.WORKER_API_URL ?? "http://localhost:4000";
const workerId = process.env.WORKER_ID;
const workerToken = process.env.WORKER_TOKEN;
const version = process.env.WORKER_VERSION ?? "0.1.0";
const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
const executor = new DeploymentExecutor();

const worker = new Worker("deployments", async (job) => {
  if (!job.data?.deploymentId) throw new Error("Deployment job is missing deploymentId");
  return executor.execute(job.data.deploymentId as string);
}, { connection, concurrency: 1 });

worker.on("completed", (job) => console.log(`[worker] completed ${job.id}`));
worker.on("failed", (job, error) => console.error(`[worker] failed ${job?.id}`, error));

if (workerId && workerToken) {
  const heartbeat = async () => {
    try { await sendHeartbeat(apiUrl, workerId, workerToken, version); console.log(`[worker] heartbeat ${workerId}`); }
    catch (error) { console.error("[worker] heartbeat failed", error); }
  };
  await heartbeat();
  setInterval(() => void heartbeat(), 30_000);
} else {
  console.warn("[worker] WORKER_ID or WORKER_TOKEN missing; heartbeat disabled");
}
console.log("DeployPilot worker online");
