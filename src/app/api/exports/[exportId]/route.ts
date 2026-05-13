import { fail, ok } from "@/server/workflow/http";
import { getExportJob } from "@/server/exports/export-jobs";

export async function GET(_req: Request, { params }: { params: Promise<{ exportId: string }> }) {
  try {
    const { exportId } = await params;
    const job = await getExportJob(exportId);
    return ok({ job });
  } catch (error) {
    return fail(error);
  }
}
