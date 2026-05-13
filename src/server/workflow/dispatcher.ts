import { enqueueWorkflowJob, getWorkflowQueue } from "@/server/queue";

export async function isJobActive(jobId: string) {
  const job = await getWorkflowQueue().getJob(jobId);
  if (!job) return false;
  const state = await job.getState();
  return state === "active" || state === "waiting" || state === "delayed" || state === "prioritized";
}

export async function dispatchJob(jobId: string) {
  if (await isJobActive(jobId)) return false;
  await enqueueWorkflowJob(jobId);
  return true;
}
