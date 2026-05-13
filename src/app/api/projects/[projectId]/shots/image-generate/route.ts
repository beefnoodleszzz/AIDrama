import { z } from "zod";
import { fail, ok } from "@/server/workflow/http";
import { batchGenerateShotImages } from "@/server/workflow/service";

const schema = z.object({ episodeNo: z.number().int().min(1) });

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    const { episodeNo } = schema.parse(await req.json());
    const result = await batchGenerateShotImages(projectId, episodeNo);
    return ok({ result });
  } catch (error) {
    return fail(error);
  }
}
