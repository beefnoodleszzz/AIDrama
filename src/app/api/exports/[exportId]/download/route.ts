import { fail } from "@/server/workflow/http";
import { getExportDownloadUrl } from "@/server/exports/export-jobs";

export async function GET(_req: Request, { params }: { params: Promise<{ exportId: string }> }) {
  try {
    const { exportId } = await params;
    const { url } = await getExportDownloadUrl(exportId);
    return Response.redirect(url, 302);
  } catch (error) {
    return fail(error);
  }
}
