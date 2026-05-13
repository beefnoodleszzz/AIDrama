import { z } from "zod";
import { importEpisodeScript } from "@/server/workflow/service";
import { fail, ok } from "@/server/workflow/http";

const schema = z.object({
  episodeNo: z.number().int().min(1),
  title: z.string().optional(),
  rawScript: z.string().min(20),
  sourceType: z.enum(["imported", "ai_generated"]).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const body = schema.parse(await req.json());
    const { projectId } = await params;
    const episode = await importEpisodeScript(projectId, body);
    return ok({ episode }, 201);
  } catch (error) {
    return fail(error);
  }
}
