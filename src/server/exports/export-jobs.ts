import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { getAuthUserIdFromCookie } from "@/lib/auth";
import { WorkflowError } from "@/server/workflow/errors";
import { enqueueExportJob, removeExportJob } from "@/server/queue";
import { exportProjectAsCsv, exportProjectAsPdf, exportProjectAsXlsx, exportProjectAsZip, type ExportFormat, type ExportProject } from "./project-exporter";
import { generateFilename, getFileUrl, getPublicUrl, uploadFile } from "@/server/oss";

const EXPORT_FORMATS: ExportFormat[] = ["xlsx", "pdf", "csv", "zip"];
const exportCreditCost: Record<ExportFormat, number> = {
  xlsx: 1,
  pdf: 1,
  csv: 1,
  zip: 2,
};

function asJson(value: unknown) {
  return value as Prisma.InputJsonValue;
}

async function requireUserId() {
  const userId = await getAuthUserIdFromCookie();
  if (!userId) throw new WorkflowError("Unauthorized", "UNAUTHORIZED");
  return userId;
}

export async function createExportJob(projectId: string, format: ExportFormat) {
  const userId = await requireUserId();
  if (!EXPORT_FORMATS.includes(format)) throw new WorkflowError("Invalid export format", "VALIDATION_ERROR");

  const project = await prisma.storyProject.findFirst({ where: { id: projectId, userId }, select: { id: true } });
  if (!project) throw new WorkflowError("Project not found", "NOT_FOUND");

  const job = await prisma.projectExportJob.create({
    data: {
      projectId,
      format,
      status: "queued",
      inputPayload: asJson({ includeAssets: process.env.EXPORT_ZIP_INCLUDE_ASSETS === "true" }),
    },
  });

  await enqueueExportJob(job.id);
  return job;
}

export async function listProjectExportJobs(projectId: string, limit = 50) {
  const userId = await requireUserId();
  const project = await prisma.storyProject.findFirst({ where: { id: projectId, userId }, select: { id: true } });
  if (!project) throw new WorkflowError("Project not found", "NOT_FOUND");

  return prisma.projectExportJob.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 200),
  });
}

export async function getExportJob(exportId: string) {
  const userId = await requireUserId();
  const job = await prisma.projectExportJob.findFirst({
    where: { id: exportId, project: { userId } },
  });
  if (!job) throw new WorkflowError("Export job not found", "NOT_FOUND");
  return job;
}

export async function getExportDownloadUrl(exportId: string) {
  const job = await getExportJob(exportId);
  if (job.status !== "done" || !job.fileKey) {
    throw new WorkflowError("Export is not ready", "INVALID_STATE");
  }
  const url = await getFileUrl(job.fileKey);
  return { url, exportId: job.id };
}

export async function retryExportJob(exportId: string) {
  const userId = await requireUserId();
  const job = await prisma.projectExportJob.findFirst({
    where: { id: exportId, project: { userId } },
  });
  if (!job) throw new WorkflowError("Export job not found", "NOT_FOUND");

  await prisma.projectExportJob.update({
    where: { id: exportId },
    data: {
      retries: { increment: 1 },
      status: "queued",
      errorCode: null,
      errorMessage: null,
      fileUrl: null,
      fileKey: null,
      startedAt: null,
      finishedAt: null,
      durationMs: null,
    },
  });

  await enqueueExportJob(exportId);
  return { queued: true, exportId };
}

export async function cancelExportJob(exportId: string) {
  const userId = await requireUserId();
  const job = await prisma.projectExportJob.findFirst({
    where: { id: exportId, project: { userId } },
  });
  if (!job) throw new WorkflowError("Export job not found", "NOT_FOUND");
  if (job.status === "done") throw new WorkflowError("Export already completed", "INVALID_STATE");
  if (job.status === "cancelled") return { cancelled: true, exportId };
  if (job.status === "running") throw new WorkflowError("Export job is running and cannot be cancelled", "INVALID_STATE");

  await removeExportJob(exportId);
  await prisma.projectExportJob.update({
    where: { id: exportId },
    data: {
      status: "cancelled",
      errorCode: "CANCELLED_BY_USER",
      errorMessage: "用户取消导出任务",
      finishedAt: new Date(),
      durationMs: job.startedAt ? Date.now() - job.startedAt.getTime() : null,
    },
  });
  return { cancelled: true, exportId };
}

async function loadExportProject(projectId: string): Promise<ExportProject> {
  const project = await prisma.storyProject.findUnique({
    where: { id: projectId },
    include: {
      characters: {
        select: { name: true, appearanceLock: true, outfitLock: true, negativePrompt: true },
        orderBy: { createdAt: "asc" },
      },
      episodes: {
        include: {
          shots: {
            include: {
              prompt: true,
              imageAssets: { where: { isActive: true }, take: 1, orderBy: { createdAt: "desc" } },
              videoAssets: { where: { isActive: true }, take: 1, orderBy: { createdAt: "desc" } },
              audioAssets: { where: { isActive: true }, take: 1, orderBy: { createdAt: "desc" } },
            },
            orderBy: { shotNo: "asc" },
          },
        },
        orderBy: { episodeNo: "asc" },
      },
    },
  });

  if (!project) throw new WorkflowError("Project not found", "NOT_FOUND");

  return {
    title: project.title,
    synopsis: project.synopsis,
    characters: project.characters,
    episodes: project.episodes.map((ep) => ({
      episodeNo: ep.episodeNo,
      title: ep.title,
      rawScript: ep.rawScript,
      shots: ep.shots.map((s) => ({
        shotNo: s.shotNo,
        durationSeconds: s.durationSeconds,
        shotType: s.shotType,
        cameraLanguage: s.cameraLanguage,
        continuityHint: s.continuityHint,
        promptText: s.prompt?.promptText || null,
        promptJson: s.prompt?.promptJson || null,
      })),
    })),
  };
}

export async function runExportJobAsSystem(exportId: string) {
  const startedAt = new Date();
  const job = await prisma.projectExportJob.findUnique({ where: { id: exportId } });
  if (!job) throw new WorkflowError("Export job not found", "NOT_FOUND");

  if (job.status === "running") return { skipped: true };

  await prisma.projectExportJob.update({
    where: { id: exportId },
    data: { status: "running", errorCode: null, errorMessage: null, startedAt },
  });

  try {
    const projectOwner = await prisma.storyProject.findUnique({
      where: { id: job.projectId },
      select: { userId: true },
    });
    if (!projectOwner) throw new WorkflowError("Project not found", "NOT_FOUND");

    const cost = new Prisma.Decimal(exportCreditCost[job.format as ExportFormat] || 1);
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: projectOwner.userId }, select: { creditBalance: true } });
      if (!user) throw new WorkflowError("User not found", "NOT_FOUND");
      if (user.creditBalance.lt(cost)) throw new WorkflowError("额度不足，请购买额度后继续", "CREDIT_NOT_ENOUGH");
      const nextBalance = user.creditBalance.minus(cost);
      await tx.user.update({ where: { id: projectOwner.userId }, data: { creditBalance: nextBalance } });
      await tx.creditLedger.create({
        data: {
          userId: projectOwner.userId,
          projectId: job.projectId,
          generationJobId: job.id,
          changeType: "consume",
          amount: cost.negated(),
          balanceAfter: nextBalance,
          reason: `导出${String(job.format).toUpperCase()}`,
          metadata: asJson({ type: "export_job", format: job.format }),
        },
      });
    });

    const project = await loadExportProject(job.projectId);
    const includeAssets = (job.inputPayload as { includeAssets?: boolean } | null)?.includeAssets === true;

    const assets = [] as Array<{ kind: "image" | "video" | "audio"; shotNo: number; url: string }>;
    const fullProject = await prisma.storyProject.findUnique({
      where: { id: job.projectId },
      include: {
        episodes: {
          include: {
            shots: {
              include: {
                imageAssets: { where: { isActive: true }, take: 1, orderBy: { createdAt: "desc" } },
                videoAssets: { where: { isActive: true }, take: 1, orderBy: { createdAt: "desc" } },
                audioAssets: { where: { isActive: true }, take: 1, orderBy: { createdAt: "desc" } },
              },
              orderBy: { shotNo: "asc" },
            },
          },
        },
      },
    });
    if (fullProject) {
      for (const ep of fullProject.episodes) {
        for (const s of ep.shots) {
          if (s.imageAssets[0]?.imageUrl) assets.push({ kind: "image", shotNo: s.shotNo, url: s.imageAssets[0].imageUrl });
          if (s.videoAssets[0]?.videoUrl) assets.push({ kind: "video", shotNo: s.shotNo, url: s.videoAssets[0].videoUrl });
          if (s.audioAssets[0]?.audioUrl) assets.push({ kind: "audio", shotNo: s.shotNo, url: s.audioAssets[0].audioUrl });
        }
      }
    }

    const format = job.format as ExportFormat;
    const fileBuffer =
      format === "xlsx"
        ? exportProjectAsXlsx(project)
        : format === "pdf"
          ? exportProjectAsPdf(project)
          : format === "csv"
            ? exportProjectAsCsv(project)
            : await exportProjectAsZip(project, { includeAssets, assets });

    const ext = format === "pdf" ? "pdf" : format === "xlsx" ? "xlsx" : format === "csv" ? "csv" : "zip";
    const key = generateFilename(job.projectId, "exports", ext);
    await uploadFile(fileBuffer, key, format === "pdf" ? "application/pdf" : format === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : format === "csv" ? "text/csv" : "application/zip");
    const fileUrl = getPublicUrl(key);

    await prisma.projectExportJob.update({
      where: { id: exportId },
      data: {
        status: "done",
        fileUrl,
        fileKey: key,
        outputPayload: asJson({ format, includeAssets, assetCount: assets.length }),
        finishedAt: new Date(),
        durationMs: Date.now() - startedAt.getTime(),
      },
    });

    return { done: true, exportId, fileUrl };
  } catch (error) {
    const projectOwner = await prisma.storyProject.findUnique({
      where: { id: job.projectId },
      select: { userId: true },
    });
    if (projectOwner) {
      const refund = new Prisma.Decimal(exportCreditCost[job.format as ExportFormat] || 1);
      await prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({ where: { id: projectOwner.userId }, select: { creditBalance: true } });
        if (!user) return;
        const nextBalance = user.creditBalance.plus(refund);
        await tx.user.update({ where: { id: projectOwner.userId }, data: { creditBalance: nextBalance } });
        await tx.creditLedger.create({
          data: {
            userId: projectOwner.userId,
            projectId: job.projectId,
            generationJobId: job.id,
            changeType: "refund",
            amount: refund,
            balanceAfter: nextBalance,
            reason: `退款-导出失败 ${String(job.format).toUpperCase()}`,
            metadata: asJson({ type: "export_job", format: job.format }),
          },
        });
      });
    }

    await prisma.projectExportJob.update({
      where: { id: exportId },
      data: {
        status: "failed",
        errorCode: "EXPORT_FAILED",
        errorMessage: error instanceof Error ? error.message : "Export failed",
        finishedAt: new Date(),
        durationMs: Date.now() - startedAt.getTime(),
      },
    });
    throw error;
  }
}
