import { z } from "zod";
import { fail, ok } from "@/server/workflow/http";
import { mixProjectEpisodeAudio } from "@/server/workflow/service";

const schema = z.object({
  episodeNo: z.number().int().min(1),
});

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    const { episodeNo } = schema.parse(await req.json());
    const renderOutput = await mixProjectEpisodeAudio(projectId, episodeNo);
    return ok({ renderOutput });
  } catch (error) {
    return fail(error);
  }
}
