import { fail, ok } from "@/server/workflow/http";
import { listProjectJobs } from "@/server/workflow/service";

export async function GET(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    const { searchParams } = new URL(req.url);
    const limit = Number(searchParams.get("limit") || "50");
    const jobs = await listProjectJobs(projectId, Number.isFinite(limit) ? limit : 50);
    return ok({ jobs });
  } catch (error) {
    return fail(error);
  }
}
