import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { fail, ok } from "@/server/workflow/http";
import { prisma } from "@/server/db";
import { WorkflowError } from "@/server/workflow/errors";

const asJson = (v: unknown): Prisma.InputJsonValue => v as Prisma.InputJsonValue;

const updateShotSchema = z.object({
  promptText: z.string().min(1).max(1000).optional(),
  durationSeconds: z.number().min(1).max(30).optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ shotId: string }> }
) {
  try {
    const { shotId } = await params;
    const body = updateShotSchema.parse(await req.json());

    const shot = await prisma.storyShot.findFirst({
      where: {
        id: shotId,
        episodeScript: {
          project: {
            user: {
              id: { not: undefined },
            },
          },
        },
      },
      include: { prompt: true },
    });

    if (!shot) {
      throw new WorkflowError("Shot not found", "NOT_FOUND");
    }

    if (body.promptText !== undefined) {
      if (shot.prompt) {
        await prisma.shotPrompt.update({
          where: { shotId: shot.id },
          data: {
            promptText: body.promptText,
            promptJson: asJson({ ...(shot.prompt.promptJson as Record<string, unknown> || {}), promptText: body.promptText }),
          },
        });
      } else {
        await prisma.shotPrompt.create({
          data: {
            shotId: shot.id,
            promptText: body.promptText,
            promptJson: asJson({ promptText: body.promptText }),
          },
        });
      }
    }

    if (body.durationSeconds !== undefined) {
      await prisma.storyShot.update({
        where: { id: shot.id },
        data: { durationSeconds: body.durationSeconds },
      });
    }

    return ok({ updated: true });
  } catch (error) {
    return fail(error);
  }
}
