import { z } from "zod";
import { fail, ok } from "@/server/workflow/http";
import { createExportJob, listProjectExportJobs } from "@/server/exports/export-jobs";

const postSchema = z.object({
  format: z.enum(["xlsx", "pdf", "csv", "zip"]),
});

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    const { format } = postSchema.parse(await req.json());
    const job = await createExportJob(projectId, format);
    return ok({ job }, 201);
  } catch (error) {
    return fail(error);
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    const { searchParams } = new URL(req.url);
    const limit = Number(searchParams.get("limit") || "50");
    const jobs = await listProjectExportJobs(projectId, Number.isFinite(limit) ? limit : 50);
    return ok({ jobs });
  } catch (error) {
    return fail(error);
  }
}
