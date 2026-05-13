import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { Workspace } from "./workspace";

export default async function WorkspacePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await prisma.storyProject.findUnique({
    where: { id: projectId },
    include: {
      episodes: {
        include: {
          shots: {
            include: {
              prompt: true,
              imageAssets: { orderBy: { createdAt: "desc" } },
              videoAssets: { orderBy: { createdAt: "desc" } },
              audioAssets: { orderBy: { createdAt: "desc" } },
            },
            orderBy: { shotNo: "asc" },
          },
        },
        orderBy: { episodeNo: "asc" },
      },
      characters: {
        select: {
          id: true,
          name: true,
          appearanceLock: true,
          outfitLock: true,
          negativePrompt: true,
          referenceImageUrl: true,
          metadata: true,
        },
        orderBy: { createdAt: "asc" },
      },
      renderOutputs: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });

  if (!project) notFound();
  return <Workspace project={project as Parameters<typeof Workspace>[0]["project"]} />;
}
