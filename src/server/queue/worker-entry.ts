import "dotenv/config";
import { Worker } from "bullmq";
import IORedis from "ioredis";
import { runWorkflowJobAsSystem } from "@/server/workflow/service";
import { runExportJobAsSystem } from "@/server/exports/export-jobs";
import { workflowQueueName } from "@/server/queue";

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  throw new Error("REDIS_URL is not defined");
}

const connection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

const worker = new Worker(
  workflowQueueName,
  async (job) => {
    if (job.name === "export-job") {
      const exportId = job.data?.exportId;
      if (typeof exportId !== "string" || !exportId) {
        throw new Error("export job missing exportId");
      }
      return runExportJobAsSystem(exportId);
    }

    const workflowJobId = job.data?.jobId;
    if (typeof workflowJobId !== "string" || !workflowJobId) {
      throw new Error("workflow job missing jobId");
    }
    return runWorkflowJobAsSystem(workflowJobId);
  },
  {
    connection,
    concurrency: Number(process.env.WORKFLOW_WORKER_CONCURRENCY || 1),
  }
);

worker.on("completed", (job) => {
  console.log(`[workflow-worker] completed ${job.id}`);
});

worker.on("failed", (job, error) => {
  console.error(`[workflow-worker] failed ${job?.id}:`, error);
});

async function shutdown() {
  await worker.close();
  await connection.quit();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

console.log(`[workflow-worker] listening on ${workflowQueueName}`);
