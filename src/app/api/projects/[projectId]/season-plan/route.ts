import { fail, ok } from "@/server/workflow/http";
import { generateSeasonPlan } from "@/server/workflow/service";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const project = await generateSeasonPlan(projectId);
    return ok({ project }, 201);
  } catch (error) {
    return fail(error);
  }
}
