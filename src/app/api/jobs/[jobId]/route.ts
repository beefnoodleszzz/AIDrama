import { fail, ok } from "@/server/workflow/http";
import { getJob } from "@/server/workflow/service";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const job = await getJob(jobId);
    if (!job) {
      return ok({ error: "Job not found" }, 404);
    }
    return ok({ job });
  } catch (error) {
    return fail(error);
  }
}
