import { fail, ok } from "@/server/workflow/http";
import { getProjectStatus } from "@/server/workflow/service";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const project = await getProjectStatus(projectId);
    return ok({ project });
  } catch (error) {
    return fail(error);
  }
}
