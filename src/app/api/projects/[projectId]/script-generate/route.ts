import { z } from "zod";
import { fail, ok } from "@/server/workflow/http";
import { generateEpisodeScript } from "@/server/workflow/service";

const schema = z.object({
  episodeNo: z.number().int().min(1),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const { episodeNo } = schema.parse(await req.json());
    const episode = await generateEpisodeScript(projectId, episodeNo);
    return ok({ episode }, 201);
  } catch (error) {
    return fail(error);
  }
}
