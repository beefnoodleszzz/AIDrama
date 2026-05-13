import { z } from "zod";
import { fail, ok } from "@/server/workflow/http";
import { saveProjectCharacters } from "@/server/workflow/service";

const item = z.object({
  characterId: z.string().min(1).optional(),
  name: z.string().min(1),
  appearanceLock: z.string().optional(),
  outfitLock: z.string().optional(),
  negativePrompt: z.string().optional(),
  referenceImageUrl: z.string().optional(),
  voice: z.string().optional(),
});

const schema = z.object({ updates: z.array(item).min(1) });

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    const { updates } = schema.parse(await req.json());
    const characters = await saveProjectCharacters(projectId, updates);
    return ok({ characters });
  } catch (error) {
    return fail(error);
  }
}
