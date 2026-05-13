import { fail, ok } from "@/server/workflow/http";
import { cancelExportJob } from "@/server/exports/export-jobs";

export async function POST(_req: Request, { params }: { params: Promise<{ exportId: string }> }) {
  try {
    const { exportId } = await params;
    const result = await cancelExportJob(exportId);
    return ok({ result });
  } catch (error) {
    return fail(error);
  }
}
