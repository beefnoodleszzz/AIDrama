import { removeWorkflowJob } from "@/server/queue";
import { fail, ok } from "@/server/workflow/http";
import { cancelWorkflowJob } from "@/server/workflow/service";

export async function POST(_req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await params;
    const result = await cancelWorkflowJob(jobId);
    await removeWorkflowJob(jobId);
    return ok({ result });
  } catch (error) {
    return fail(error);
  }
}
