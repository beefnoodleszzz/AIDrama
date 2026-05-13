import { z } from "zod";
import { fail, ok } from "@/server/workflow/http";
import { retryShot } from "@/server/workflow/service";

const schema = z.object({
  mode: z.enum(["prompt", "image", "video"]),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ shotId: string }> }
) {
  try {
    const { shotId } = await params;
    const { mode } = schema.parse(await req.json());
    const result = await retryShot(shotId, mode);
    return ok({ result });
  } catch (error) {
    return fail(error);
  }
}
