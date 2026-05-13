import { fail, ok } from "@/server/workflow/http";
import { dispatchJob, isJobActive } from "@/server/workflow/dispatcher";
import { ensureWorkflowJobOwned } from "@/server/workflow/service";

export async function POST(_req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await params;
    await ensureWorkflowJobOwned(jobId);

    if (await isJobActive(jobId)) {
      return ok({ accepted: false, reason: "already_running", jobId });
    }

    const accepted = await dispatchJob(jobId);
    return ok({ accepted, jobId });
  } catch (error) {
    return fail(error);
  }
}
