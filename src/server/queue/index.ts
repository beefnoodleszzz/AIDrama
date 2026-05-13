import { Queue } from "bullmq";
import IORedis from "ioredis";

const queueName = "workflow-jobs";
let queue: Queue | null = null;
let connection: IORedis | null = null;

function getConnection() {
  if (connection) return connection;
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL is not defined");
  connection = new IORedis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
  return connection;
}

export function getWorkflowQueue() {
  if (queue) return queue;
  queue = new Queue(queueName, {
    connection: getConnection(),
    defaultJobOptions: {
      removeOnComplete: true,
      removeOnFail: false,
      attempts: 1,
    },
  });
  return queue;
}

export async function enqueueWorkflowJob(jobId: string) {
  return getWorkflowQueue().add(
    "workflow-job",
    { jobId },
    { jobId }
  );
}

export async function enqueueExportJob(exportId: string) {
  return getWorkflowQueue().add(
    "export-job",
    { exportId },
    { jobId: `export:${exportId}` }
  );
}

export async function removeWorkflowJob(jobId: string) {
  const job = await getWorkflowQueue().getJob(jobId);
  if (job) {
    await job.remove();
  }
}

export async function removeExportJob(exportId: string) {
  const job = await getWorkflowQueue().getJob(`export:${exportId}`);
  if (job) {
    await job.remove();
  }
}

export async function closeWorkflowQueue() {
  if (queue) {
    await queue.close();
    queue = null;
  }
  if (connection) {
    await connection.quit();
    connection = null;
  }
}

export const workflowQueueName = queueName;
