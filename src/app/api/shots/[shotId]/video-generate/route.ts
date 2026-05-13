import { fail, ok } from "@/server/workflow/http";
import { generateShotVideo } from "@/server/workflow/service";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ shotId: string }> }
) {
  try {
    const { shotId } = await params;
    const asset = await generateShotVideo(shotId);
    return ok({ asset });
  } catch (error) {
    return fail(error);
  }
}
