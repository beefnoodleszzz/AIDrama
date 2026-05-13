import { z } from "zod";
import { fail, ok } from "@/server/workflow/http";
import { prisma } from "@/server/db";
import { WorkflowError } from "@/server/workflow/errors";

const schema = z.object({
  assetType: z.enum(["image", "video", "audio"]),
  assetId: z.string().min(1),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ shotId: string }> }
) {
  try {
    const { shotId } = await params;
    const { assetType, assetId } = schema.parse(await req.json());

    const shot = await prisma.storyShot.findFirst({
      where: { id: shotId },
    });
    if (!shot) throw new WorkflowError("Shot not found", "NOT_FOUND");

    const where = { shotId, id: assetId };
    if (assetType === "image") {
      const asset = await prisma.shotImageAsset.findFirst({ where });
      if (!asset) throw new WorkflowError("Image asset not found", "NOT_FOUND");
      await prisma.shotImageAsset.updateMany({ where: { shotId }, data: { isActive: false } });
      await prisma.shotImageAsset.update({ where: { id: assetId }, data: { isActive: true } });
    } else if (assetType === "video") {
      const asset = await prisma.shotVideoAsset.findFirst({ where });
      if (!asset) throw new WorkflowError("Video asset not found", "NOT_FOUND");
      await prisma.shotVideoAsset.updateMany({ where: { shotId }, data: { isActive: false } });
      await prisma.shotVideoAsset.update({ where: { id: assetId }, data: { isActive: true } });
    } else {
      const asset = await prisma.storyAudioAsset.findFirst({ where });
      if (!asset) throw new WorkflowError("Audio asset not found", "NOT_FOUND");
      await prisma.storyAudioAsset.updateMany({ where: { shotId }, data: { isActive: false } });
      await prisma.storyAudioAsset.update({ where: { id: assetId }, data: { isActive: true } });
    }

    return ok({ success: true });
  } catch (error) {
    return fail(error);
  }
}
