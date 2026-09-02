import { Worker } from "bullmq";

const redisUrl = new URL(process.env.REDIS_URL ?? "redis://localhost:6379");
const connection = {
  host: redisUrl.hostname,
  port: Number(redisUrl.port || 6379),
  password: redisUrl.password || undefined,
};

const worker = new Worker(
  "deployments",
  async (job) => {
    // Docker execution will be added behind a dedicated, resource-limited adapter.
    // Never pass untrusted repository input directly to a shell command.
    console.log(`[worker] received deployment ${job.data.deploymentId}`);
    return { accepted: true };
  },
  { connection, concurrency: 1 },
);

worker.on("completed", (job) => console.log(`[worker] completed ${job.id}`));
worker.on("failed", (job, error) => console.error(`[worker] failed ${job?.id}`, error));
console.log("DeployPilot worker online");
