import dotenv from "dotenv";
import { Queue, Worker } from "bullmq";
dotenv.config({ path: new URL("../../../.env", import.meta.url) });
import { Redis } from "ioredis";
import { DeploymentExecutor } from "./deployment-executor.js";
import { sendHeartbeat } from "./heartbeat.js";
import { reportDeploymentResult } from "./result-notifier.js";

const apiUrl = process.env.WORKER_API_URL ?? "http://localhost:4000";
const workerId = process.env.WORKER_ID;
const workerToken = process.env.WORKER_TOKEN;
const version = process.env.WORKER_VERSION ?? "0.1.0";
const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
const executor = new DeploymentExecutor();

const worker = new Worker("deployments", async (job) => {
  if (!job.data?.deploymentId) throw new Error("Deployment job is missing deploymentId");
  const deploymentId = job.data.deploymentId as string;
  const result = await executor.execute(deploymentId);
  if (workerId && workerToken && result.status) {
    try {
      const notification = await reportDeploymentResult(apiUrl, workerId, workerToken, deploymentId, result.status);
      if (notification.sent) console.log(`[worker] notification sent for ${deploymentId}`);
      else console.log(`[worker] notification skipped: ${notification.reason ?? "not configured"}`);
    } catch (error) { console.error("[worker] notification failed", error); }
  }
  return result;
}, { connection, concurrency: 1 });
const queue = new Queue("deployments", { connection: new Redis(redisUrl, { maxRetriesPerRequest: null }) });

connection.on("connect", () => console.log("[worker] connecting to Redis ..."));
connection.on("ready", () => console.log("[worker] Redis connection ready"));
connection.on("error", (error) => console.error("[worker] Redis connection failed:", error.message));
worker.on("active", (job) => console.log(`[worker] claimed deployment ${job.data?.deploymentId ?? job.id}`));
worker.on("completed", (job) => console.log(`[worker] completed ${job.id}`));
worker.on("failed", (job, error) => console.error(`[worker] failed ${job?.id}`, error));
worker.on("error", (error) => console.error("[worker] queue error", error.message));

const reportQueue = async () => {
  try {
    const counts = await Promise.race([
      queue.getJobCounts("waiting", "active", "completed", "failed", "delayed"),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("queue inspection timed out")), 5000)),
    ]);
    console.log(`[worker] queue waiting=${counts.waiting} active=${counts.active} failed=${counts.failed} delayed=${counts.delayed}`);
  } catch (error) { console.error("[worker] queue inspection failed", error instanceof Error ? error.message : error); }
};
console.log(`[worker] connecting to Redis ${new URL(redisUrl).hostname}`);
await Promise.race([
  worker.waitUntilReady(),
  new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Redis connection timed out after 10 seconds")), 10000)),
]);
console.log("[worker] queue waiting...");
await reportQueue();
setInterval(() => void reportQueue(), 15000);

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
