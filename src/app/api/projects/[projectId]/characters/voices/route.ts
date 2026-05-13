import { z } from "zod";
import { fail, ok } from "@/server/workflow/http";
import { updateCharacterVoices } from "@/server/workflow/service";

const schema = z.object({
  updates: z.array(
    z.object({
      characterId: z.string().min(1),
      voice: z.string().min(1),
    })
  ),
});

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    const { updates } = schema.parse(await req.json());
    const characters = await updateCharacterVoices(projectId, updates);
    return ok({ characters });
  } catch (error) {
    return fail(error);
  }
}
