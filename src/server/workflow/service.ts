import {
  Prisma,
  WorkflowStatus,
  type StoryProject,
  type StoryShot,
} from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { getAuthUserIdFromCookie } from "@/lib/auth";
import { generateImageWithRouting, generateSpeechWithRouting, generateTextWithRouting, generateVideoWithRouting } from "@/server/ai";
import { renderEpisodeVideo } from "@/server/exports/video-renderer";
import { WorkflowError } from "./errors";
import { transitionShotStatus } from "./state-machine";
import { extractCharactersFromScript, generateStructuredStoryboard, type CharacterDraft, type StoryboardShot } from "./llm";
import type { RetryMode } from "./types";

function asJson(value: unknown) {
  return value as Prisma.InputJsonValue;
}

const creditCosts = {
  image_generate: 2,
  video_generate: 20,
  voice_generate: 1,
  render: 3,
  audio_mix: 5,
} as const;

type CreditJobType = keyof typeof creditCosts;

async function consumeCredits(input: {
  userId: string;
  projectId?: string;
  generationJobId?: string;
  jobType: CreditJobType;
  units?: number;
  reason: string;
}) {
  const amount = new Prisma.Decimal(creditCosts[input.jobType] * (input.units || 1));
  if (amount.lte(0)) return;

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: input.userId },
      select: { creditBalance: true },
    });
    if (!user) throw new WorkflowError("User not found", "NOT_FOUND");
    if (user.creditBalance.lt(amount)) {
      throw new WorkflowError("额度不足，请购买额度后继续", "CREDIT_NOT_ENOUGH");
    }

    const nextBalance = user.creditBalance.minus(amount);
    await tx.user.update({
      where: { id: input.userId },
      data: { creditBalance: nextBalance },
    });
    await tx.creditLedger.create({
      data: {
        userId: input.userId,
        projectId: input.projectId,
        generationJobId: input.generationJobId,
        changeType: "consume",
        amount: amount.negated(),
        balanceAfter: nextBalance,
        reason: input.reason,
        metadata: asJson({ jobType: input.jobType, units: input.units || 1 }),
      },
    });
  });
}

function durationSince(startedAt: Date) {
  return Date.now() - startedAt.getTime();
}

async function refundCredits(input: {
  userId: string;
  projectId: string;
  generationJobId: string;
  jobType: CreditJobType;
  reason: string;
}) {
  const amount = new Prisma.Decimal(creditCosts[input.jobType]);
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: input.userId },
      select: { creditBalance: true },
    });
    if (!user) return;
    const nextBalance = user.creditBalance.plus(amount);
    await tx.user.update({
      where: { id: input.userId },
      data: { creditBalance: nextBalance },
    });
    await tx.creditLedger.create({
      data: {
        userId: input.userId,
        projectId: input.projectId,
        generationJobId: input.generationJobId,
        changeType: "refund",
        amount,
        balanceAfter: nextBalance,
        reason: input.reason,
        metadata: asJson({ jobType: input.jobType }),
      },
    });
  });
}

function pickDialogueText(promptJson: Prisma.JsonValue | null, fallback: string) {
  const candidate =
    promptJson && typeof promptJson === "object" && !Array.isArray(promptJson)
      ? (promptJson as Record<string, unknown>).dialogue
      : null;
  if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  if (Array.isArray(candidate)) {
    const merged = candidate
      .map((line) => (typeof line === "string" ? line.trim() : ""))
      .filter(Boolean)
      .join("\n");
    if (merged) return merged;
  }
  return fallback.trim();
}

function parseSpeakerName(text: string) {
  const line = text.split("\n").find((v) => v.trim()) || "";
  const matched = line.match(/^([^：:\s]{1,12})[：:]/);
  return matched?.[1] || null;
}

function buildVoiceMap(
  characters: Array<{ name: string; metadata: Prisma.JsonValue | null }>
) {
  const map = new Map<string, string>();
  for (const c of characters) {
    if (!c.name) continue;
    const metadata = c.metadata && typeof c.metadata === "object" && !Array.isArray(c.metadata)
      ? (c.metadata as Record<string, unknown>)
      : null;
    const voice =
      (typeof metadata?.voice === "string" && metadata.voice) ||
      (typeof metadata?.ttsVoice === "string" && metadata.ttsVoice) ||
      "";
    if (voice) map.set(c.name, voice);
  }
  return map;
}

function buildCharacterLockText(
  characters: Array<{
    name: string;
    appearanceLock: string | null;
    outfitLock: string | null;
    negativePrompt: string | null;
    referenceImageUrl?: string | null;
  }>
) {
  const lockChunks = characters
    .map((c) => {
      const parts = [
        c.appearanceLock ? `角色${c.name}外貌锁定:${c.appearanceLock}` : "",
        c.outfitLock ? `角色${c.name}服装锁定:${c.outfitLock}` : "",
        c.negativePrompt ? `角色${c.name}负面约束:${c.negativePrompt}` : "",
        c.referenceImageUrl ? `角色${c.name}已有参考图，生成时严格参照其五官与发型` : "",
      ].filter(Boolean);
      return parts.join("，");
    })
    .filter(Boolean);

  return lockChunks.join(" | ");
}

function extractCharacterNamesFromPromptJson(promptJson: Prisma.JsonValue | null) {
  if (!promptJson || typeof promptJson !== "object" || Array.isArray(promptJson)) return [];
  const raw = (promptJson as Record<string, unknown>).characterNames;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function detectShotCharacters(
  shot: StoryboardShot,
  characters: CharacterDraft[]
) {
  const explicitNames = Array.isArray(shot.characterNames)
    ? shot.characterNames.map((name) => name.trim()).filter(Boolean)
    : [];
  if (explicitNames.length > 0) {
    return characters.filter((character) => explicitNames.includes(character.name));
  }

  const searchable = [
    shot.promptText,
    shot.continuityHint,
    typeof shot.dialogue === "string" ? shot.dialogue : Array.isArray(shot.dialogue) ? shot.dialogue.join("\n") : "",
  ].join("\n");

  const matched = characters.filter((character) => searchable.includes(character.name));
  if (matched.length > 0) return matched;
  if (characters.length === 1) return characters;
  return [];
}

function enrichStoryboardShotsWithCharacters(
  shots: StoryboardShot[],
  characters: CharacterDraft[]
) {
  return shots.map((shot) => {
    const matched = detectShotCharacters(shot, characters);
    const anchorText = matched
      .map((character) => {
        const detail = [character.appearanceLock, character.outfitLock].filter(Boolean).join("，");
        return detail ? `${character.name}（${detail}）` : character.name;
      })
      .join("，");

    const promptParts = [
      shot.promptText.trim(),
      matched.length > 0 ? `角色锚点：${anchorText}` : "",
      "写实电影感，同一角色保持固定长相、发型和服装，禁止换脸。",
    ].filter(Boolean);

    const continuityParts = [
      shot.continuityHint.trim(),
      matched.length > 0 ? `延续角色：${matched.map((character) => character.name).join("、")}` : "",
    ].filter(Boolean);

    return {
      ...shot,
      characterNames: matched.map((character) => character.name),
      continuityHint: continuityParts.join("；"),
      promptText: promptParts.join(" "),
    };
  });
}

async function syncProjectCharactersFromScript(
  tx: Prisma.TransactionClient,
  projectId: string,
  characters: CharacterDraft[]
) {
  if (characters.length === 0) return;
  const existingCharacters = await tx.characterProfile.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
  });
  const existingMap = new Map(existingCharacters.map((character) => [character.name, character]));

  for (const character of characters) {
    const existing = existingMap.get(character.name);
    if (!existing) {
      await tx.characterProfile.create({
        data: {
          projectId,
          name: character.name,
          appearanceLock: character.appearanceLock?.trim() || null,
          outfitLock: character.outfitLock?.trim() || null,
          negativePrompt: character.negativePrompt?.trim() || null,
          metadata: asJson({ autoCreated: true }),
        },
      });
      continue;
    }

    await tx.characterProfile.update({
      where: { id: existing.id },
      data: {
        appearanceLock: existing.appearanceLock || character.appearanceLock?.trim() || null,
        outfitLock: existing.outfitLock || character.outfitLock?.trim() || null,
        negativePrompt: existing.negativePrompt || character.negativePrompt?.trim() || null,
      },
    });
  }
}

async function createQcReport(
  shotId: string,
  result: "PASS" | "FAIL",
  issues: Array<{ type: string; severity: "INFO" | "WARN" | "ERROR"; message: string }>
) {
  return prisma.qcReport.create({
    data: {
      shotId,
      result,
      score: result === "PASS" ? 1 : 0,
      issues: asJson(issues),
    },
  });
}

async function runBasicQcForEpisodeShots(
  shots: Array<{
    id: string;
    shotNo: number;
    durationSeconds: number;
    prompt: { promptText: string } | null;
    videoAssets: Array<{ videoUrl: string }>;
    audioAssets?: Array<{ audioUrl: string }>;
  }>,
  requireAudio: boolean
) {
  for (const shot of shots) {
    const issues: Array<{ type: string; severity: "INFO" | "WARN" | "ERROR"; message: string }> = [];
    const video = shot.videoAssets[0];

    if (!video?.videoUrl) {
      issues.push({ type: "MISSING_VIDEO", severity: "ERROR", message: "缺少有效视频资产" });
    }

    if (requireAudio && (!shot.audioAssets || !shot.audioAssets[0]?.audioUrl)) {
      issues.push({ type: "MISSING_AUDIO", severity: "ERROR", message: "缺少有效配音资产" });
    }

    if (shot.durationSeconds < 0.5 || shot.durationSeconds > 30) {
      issues.push({
        type: "INVALID_DURATION",
        severity: "ERROR",
        message: `镜头时长异常: ${shot.durationSeconds}s`,
      });
    }

    if (!shot.prompt?.promptText?.trim()) {
      issues.push({ type: "MISSING_PROMPT", severity: "ERROR", message: "缺少分镜词 promptText" });
    }

    if (video?.videoUrl && !video.videoUrl.startsWith("mock://")) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(video.videoUrl, { method: "HEAD", signal: controller.signal });
        clearTimeout(timer);
        if (!res.ok) {
          issues.push({
            type: "VIDEO_UNREACHABLE",
            severity: "ERROR",
            message: `视频 URL 不可访问: HTTP ${res.status}`,
          });
        }
      } catch {
        issues.push({
          type: "VIDEO_UNREACHABLE",
          severity: "ERROR",
          message: "视频 URL 访问失败（网络或超时）",
        });
      }
    }

    if (issues.length > 0) {
      await createQcReport(shot.id, "FAIL", issues);
      throw new WorkflowError(`镜头 ${shot.shotNo} 质检失败: ${issues[0].message}`, "INVALID_STATE");
    }

    await createQcReport(shot.id, "PASS", [{ type: "BASIC_QC_PASS", severity: "INFO", message: "基础质检通过" }]);
  }
}

const episodeScriptDraftSchema = z.object({
  title: z.string().min(1).max(80),
  storySummary: z.string().min(20).max(500),
  episodeGoal: z.string().min(10).max(300),
  continuityNotes: z.array(z.string().min(1).max(200)).min(1).max(8),
  hook: z.string().min(10).max(200),
  rawScript: z.string().min(80).max(6000),
});

const seasonPlanSchema = z.object({
  logline: z.string().min(20).max(300),
  worldRules: z.array(z.string().min(1).max(200)).min(2).max(8),
  coreConflict: z.string().min(20).max(300),
  endingDirection: z.string().min(20).max(300),
  episodeOutlines: z.array(z.object({
    episodeNo: z.number().int().min(1).max(999),
    title: z.string().min(1).max(80),
    objective: z.string().min(10).max(200),
    summary: z.string().min(20).max(400),
    hook: z.string().min(10).max(200),
  })).min(1).max(100),
});

function summarizeEpisodeContext(input: Array<{ episodeNo: number; title: string | null; rawScript: string }>) {
  return input
    .map((episode) => `第${episode.episodeNo}集 ${episode.title || ""}\n${episode.rawScript.slice(0, 500)}`)
    .join("\n\n");
}

function readSeasonPlan(metadata: Prisma.JsonValue | null) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const parsed = seasonPlanSchema.safeParse((metadata as Record<string, unknown>).seasonPlan);
  return parsed.success ? parsed.data : null;
}

export async function requireUserId() {
  const userId = await getAuthUserIdFromCookie();
  if (!userId) throw new WorkflowError("Unauthorized", "UNAUTHORIZED");
  return userId;
}

export async function createProject(input: {
  title: string;
  synopsis?: string;
  episodeTarget?: number;
}): Promise<StoryProject> {
  const userId = await requireUserId();
  return prisma.storyProject.create({
    data: {
      userId,
      title: input.title,
      synopsis: input.synopsis,
      episodeTarget: input.episodeTarget || 1,
    },
  });
}

export async function generateSeasonPlan(projectId: string) {
  const userId = await requireUserId();
  const project = await prisma.storyProject.findFirst({
    where: { id: projectId, userId },
    select: {
      id: true,
      title: true,
      synopsis: true,
      episodeTarget: true,
      metadata: true,
      characters: {
        select: { name: true, appearanceLock: true, outfitLock: true, negativePrompt: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!project) throw new WorkflowError("Project not found", "NOT_FOUND");
  if (!project.synopsis?.trim()) {
    throw new WorkflowError("请先填写项目主题或剧情梗概，再生成全剧大纲", "VALIDATION_ERROR");
  }

  let seasonPlan: z.infer<typeof seasonPlanSchema> | null = null;
  let lastError: WorkflowError | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await generateTextWithRouting(
      "你是短剧总编剧室负责人。请为整部短剧生成全剧圣经与分集大纲，确保每一集都服务于同一主线。",
      [
        `项目标题：${project.title}`,
        `项目主题/梗概：${project.synopsis}`,
        `目标总集数：${project.episodeTarget}`,
        project.characters.length > 0
          ? `已有角色：\n${project.characters.map((character) => `${character.name}｜${character.appearanceLock || "外观待补充"}｜${character.outfitLock || "服装待补充"}`).join("\n")}`
          : "当前还没有角色卡，请同时规划主角、反派与关键配角的持续作用。",
        "输出 JSON 对象字段：logline, worldRules, coreConflict, endingDirection, episodeOutlines。",
        "episodeOutlines 必须覆盖从第1集到目标总集数，每集都包含：episodeNo, title, objective, summary, hook。",
        "要求：",
        "1. 保证整部剧是连续推进的，不是若干无关短篇。",
        "2. 每集目标和钩子必须承上启下，能推动下一集。",
        "3. 第1集负责建世界与冲突，最后一集要能回收主线。",
      ].join("\n\n"),
      { jsonMode: true, temperature: attempt === 0 ? 0.35 : 0.2 }
    );

    if (response.error) {
      lastError = new WorkflowError(`AI 生成失败: ${response.error}`, "AI_PROVIDER_FAILED");
      continue;
    }

    try {
      const parsed = JSON.parse(response.text);
      const result = seasonPlanSchema.safeParse(parsed);
      if (result.success) {
        seasonPlan = result.data;
        break;
      }
      const detail = result.error.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("；");
      lastError = new WorkflowError(`AI 全剧大纲结构异常（${detail}）`, "AI_OUTPUT_INVALID");
    } catch {
      lastError = new WorkflowError("AI 全剧大纲返回格式解析失败，请重试", "AI_OUTPUT_INVALID");
    }
  }

  if (!seasonPlan) {
    throw lastError || new WorkflowError("AI 全剧大纲生成失败，请重试", "AI_OUTPUT_INVALID");
  }

  const previousMetadata =
    project.metadata && typeof project.metadata === "object" && !Array.isArray(project.metadata)
      ? (project.metadata as Record<string, unknown>)
      : {};

  const updatedProject = await prisma.storyProject.update({
    where: { id: project.id },
    data: {
      metadata: asJson({
        ...previousMetadata,
        seasonPlan,
      }),
    },
  });

  await prisma.workflowJob.create({
    data: {
      projectId: project.id,
      jobType: "season_plan_generate",
      status: WorkflowStatus.DONE,
      outputPayload: asJson({
        episodeCount: seasonPlan.episodeOutlines.length,
        logline: seasonPlan.logline,
      }),
    },
  });

  return updatedProject;
}

export async function updateCharacterVoices(
  projectId: string,
  updates: Array<{ characterId: string; voice: string }>
) {
  const userId = await requireUserId();
  const project = await prisma.storyProject.findFirst({
    where: { id: projectId, userId },
    select: { id: true },
  });
  if (!project) throw new WorkflowError("Project not found", "NOT_FOUND");

  for (const item of updates) {
    const character = await prisma.characterProfile.findFirst({
      where: { id: item.characterId, projectId },
      select: { id: true, metadata: true },
    });
    if (!character) continue;

    const current =
      character.metadata && typeof character.metadata === "object" && !Array.isArray(character.metadata)
        ? (character.metadata as Record<string, unknown>)
        : {};
    const next = { ...current, voice: item.voice.trim() };
    await prisma.characterProfile.update({
      where: { id: character.id },
      data: { metadata: asJson(next) },
    });
  }

  return prisma.characterProfile.findMany({
    where: { projectId },
    select: { id: true, name: true, metadata: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function saveProjectCharacters(
  projectId: string,
  updates: Array<{
    characterId?: string;
    name: string;
    appearanceLock?: string;
    outfitLock?: string;
    negativePrompt?: string;
    referenceImageUrl?: string;
    voice?: string;
  }>
) {
  const userId = await requireUserId();
  const project = await prisma.storyProject.findFirst({
    where: { id: projectId, userId },
    select: { id: true },
  });
  if (!project) throw new WorkflowError("Project not found", "NOT_FOUND");

  for (const row of updates) {
    const metadata = asJson({ voice: row.voice?.trim() || "" });
    if (row.characterId) {
      await prisma.characterProfile.updateMany({
        where: { id: row.characterId, projectId },
        data: {
          name: row.name.trim(),
          appearanceLock: row.appearanceLock?.trim() || null,
          outfitLock: row.outfitLock?.trim() || null,
          negativePrompt: row.negativePrompt?.trim() || null,
          referenceImageUrl: row.referenceImageUrl?.trim() || null,
          metadata,
        },
      });
      continue;
    }

    if (!row.name.trim()) continue;
    await prisma.characterProfile.create({
      data: {
        projectId,
        name: row.name.trim(),
        appearanceLock: row.appearanceLock?.trim() || null,
        outfitLock: row.outfitLock?.trim() || null,
        negativePrompt: row.negativePrompt?.trim() || null,
        referenceImageUrl: row.referenceImageUrl?.trim() || null,
        metadata,
      },
    });
  }

  return prisma.characterProfile.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
  });
}

export async function importEpisodeScript(projectId: string, input: {
  episodeNo: number;
  title?: string;
  rawScript: string;
  sourceType?: string;
}) {
  const userId = await requireUserId();
  const project = await prisma.storyProject.findFirst({ where: { id: projectId, userId } });
  if (!project) throw new WorkflowError("Project not found", "NOT_FOUND");

  const episode = await prisma.storyEpisodeScript.upsert({
    where: { projectId_episodeNo: { projectId, episodeNo: input.episodeNo } },
    create: {
      projectId,
      episodeNo: input.episodeNo,
      title: input.title,
      rawScript: input.rawScript,
      sourceType: input.sourceType || "imported",
      status: WorkflowStatus.DRAFT,
    },
    update: {
      title: input.title,
      rawScript: input.rawScript,
      sourceType: input.sourceType || "imported",
      status: WorkflowStatus.DRAFT,
    },
  });

  await prisma.workflowJob.create({
    data: {
      projectId,
      episodeScriptId: episode.id,
      jobType: "script_import",
      status: WorkflowStatus.DONE,
      inputPayload: asJson(input),
    },
  });

  return episode;
}

export async function generateEpisodeScript(projectId: string, episodeNo: number) {
  const userId = await requireUserId();
  const project = await prisma.storyProject.findFirst({
    where: { id: projectId, userId },
    select: {
      id: true,
      title: true,
      synopsis: true,
      episodeTarget: true,
      metadata: true,
      episodes: {
        where: { episodeNo: { lt: episodeNo } },
        select: { episodeNo: true, title: true, rawScript: true },
        orderBy: { episodeNo: "asc" },
      },
    },
  });
  if (!project) throw new WorkflowError("Project not found", "NOT_FOUND");
  if (!project.synopsis?.trim()) {
    throw new WorkflowError("请先填写项目梗概或主题，再生成 AI 剧本", "VALIDATION_ERROR");
  }
  const seasonPlan = readSeasonPlan(project.metadata);
  const currentOutline = seasonPlan?.episodeOutlines.find((item) => item.episodeNo === episodeNo);

  const previousEpisodesText = summarizeEpisodeContext(project.episodes);
  const response = await generateTextWithRouting(
    "你是短剧总编剧。请围绕整部剧主线，生成当前分集剧本，并保证与前文剧情连续。",
    [
      `项目标题：${project.title}`,
      `项目主题/梗概：${project.synopsis}`,
      `总集数目标：${project.episodeTarget}`,
      `当前要生成：第${episodeNo}集`,
      seasonPlan ? `全剧圣经：\nlogline: ${seasonPlan.logline}\n核心冲突: ${seasonPlan.coreConflict}\n世界规则:\n${seasonPlan.worldRules.join("\n")}\n结局方向: ${seasonPlan.endingDirection}` : "当前还没有全剧圣经，请直接从项目主题出发构建主线。",
      currentOutline ? `本集大纲：\n标题: ${currentOutline.title}\n本集目标: ${currentOutline.objective}\n本集摘要: ${currentOutline.summary}\n本集钩子: ${currentOutline.hook}` : "当前还没有该集大纲，请先自行规划本集目标并结尾留钩子。",
      previousEpisodesText ? `前文已生成分集：\n${previousEpisodesText}` : "这是第1集，需要建立世界观、核心人物关系和主冲突。",
      "要求：",
      "1. 生成的是整部剧中的一个连续分集，不是孤立短文。",
      "2. 必须延续前文人物关系、秘密线索和冲突升级。",
      "3. 节奏适合短剧，45-90秒单集感受，结尾必须有强钩子。",
      "4. 输出 JSON 对象字段：title, storySummary, episodeGoal, continuityNotes, hook, rawScript。",
      "5. rawScript 里要包含清晰场景推进、角色对白，优先使用“角色名：台词”格式。",
    ].join("\n\n"),
    { jsonMode: true, temperature: 0.4 }
  );

  if (response.error) {
    throw new WorkflowError(`AI 生成失败: ${response.error}`, "AI_PROVIDER_FAILED");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(response.text);
  } catch {
    throw new WorkflowError("AI 剧本返回格式解析失败，请重试", "AI_OUTPUT_INVALID");
  }

  const result = episodeScriptDraftSchema.safeParse(parsed);
  if (!result.success) {
    const detail = result.error.issues
      .slice(0, 3)
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("；");
    throw new WorkflowError(`AI 剧本结构异常（${detail}）`, "AI_OUTPUT_INVALID");
  }

  const payload = result.data;
  const episode = await prisma.storyEpisodeScript.upsert({
    where: { projectId_episodeNo: { projectId, episodeNo } },
    create: {
      projectId,
      episodeNo,
      title: payload.title,
      rawScript: payload.rawScript,
      sourceType: "ai_generated",
      status: WorkflowStatus.DRAFT,
      structuredData: asJson({
        storySummary: payload.storySummary,
        episodeGoal: payload.episodeGoal,
        continuityNotes: payload.continuityNotes,
        hook: payload.hook,
        generatedFrom: "project_synopsis_and_previous_episodes",
      }),
    },
    update: {
      title: payload.title,
      rawScript: payload.rawScript,
      sourceType: "ai_generated",
      status: WorkflowStatus.DRAFT,
      structuredData: asJson({
        storySummary: payload.storySummary,
        episodeGoal: payload.episodeGoal,
        continuityNotes: payload.continuityNotes,
        hook: payload.hook,
        generatedFrom: "project_synopsis_and_previous_episodes",
      }),
    },
  });

  await prisma.workflowJob.create({
    data: {
      projectId,
      episodeScriptId: episode.id,
      jobType: "script_generate",
      status: WorkflowStatus.DONE,
      inputPayload: asJson({ episodeNo }),
      outputPayload: asJson({
        title: payload.title,
        storySummary: payload.storySummary,
        hook: payload.hook,
      }),
    },
  });

  return episode;
}

export async function generateStoryboard(projectId: string, episodeNo: number) {
  const userId = await requireUserId();
  const project = await prisma.storyProject.findFirst({ where: { id: projectId, userId } });
  if (!project) throw new WorkflowError("Project not found", "NOT_FOUND");

  const episode = await prisma.storyEpisodeScript.findUnique({
    where: { projectId_episodeNo: { projectId, episodeNo } },
  });
  if (!episode) throw new WorkflowError("Episode script not found", "NOT_FOUND");

  const job = await prisma.workflowJob.create({
    data: {
      projectId,
      episodeScriptId: episode.id,
      jobType: "storyboard_generate",
      status: WorkflowStatus.IMAGE_GENERATING,
    },
  });
  try {
    const extractedCharacters = await extractCharactersFromScript(episode.rawScript);
    const generatedShots = await generateStructuredStoryboard(episode.rawScript);
    const shots = enrichStoryboardShotsWithCharacters(generatedShots, extractedCharacters);

    await prisma.$transaction(async (tx) => {
      await syncProjectCharactersFromScript(tx, projectId, extractedCharacters);
      await tx.storyShot.deleteMany({ where: { episodeScriptId: episode.id } });

      for (const raw of shots) {
        const shot = await tx.storyShot.create({
          data: {
            episodeScriptId: episode.id,
            shotNo: Number(raw.shotNo),
            durationSeconds: Number(raw.durationSeconds || 3),
            shotType: raw.shotType,
            cameraLanguage: raw.cameraLanguage,
            continuityHint: raw.continuityHint,
            status: WorkflowStatus.PROMPT_READY,
          },
        });

        await tx.shotPrompt.create({
          data: {
            shotId: shot.id,
            promptText: raw.promptText,
            promptJson: asJson(raw),
            generationModel: process.env.TEXT_PROVIDER || "siliconflow",
          },
        });
      }

      await tx.storyEpisodeScript.update({
        where: { id: episode.id },
        data: {
          status: WorkflowStatus.PROMPT_READY,
          structuredData: asJson(shots),
        },
      });

      await tx.workflowJob.update({
        where: { id: job.id },
        data: {
          status: WorkflowStatus.DONE,
          outputPayload: asJson({ shotCount: shots.length }),
          errorCode: null,
          errorMessage: null,
        },
      });
    });

    return { episodeId: episode.id, shotCount: shots.length };
  } catch (error) {
    await prisma.workflowJob.update({
      where: { id: job.id },
      data: {
        status: WorkflowStatus.FAILED,
        errorCode: "AI_OUTPUT_INVALID",
        errorMessage: error instanceof Error ? error.message : "Storyboard generation failed",
      },
    });
    throw error;
  }
}

async function updateShotStatus(shot: StoryShot, next: WorkflowStatus) {
  transitionShotStatus(shot.status, next);
  return prisma.storyShot.update({ where: { id: shot.id }, data: { status: next } });
}

export async function generateShotImage(shotId: string, userIdOverride?: string) {
  const userId = userIdOverride || (await requireUserId());
  const shot = await prisma.storyShot.findFirst({
    where: {
      id: shotId,
      episodeScript: {
        project: { userId },
      },
    },
    include: { prompt: true, episodeScript: true },
  });
  if (!shot) throw new WorkflowError("Shot not found", "NOT_FOUND");
  if (!shot.prompt?.promptText) throw new WorkflowError("Shot prompt not ready", "INVALID_STATE");

  const projectCharacters = await prisma.characterProfile.findMany({
    where: { projectId: shot.episodeScript.projectId },
    select: { name: true, appearanceLock: true, outfitLock: true, negativePrompt: true, referenceImageUrl: true },
  });
  const promptJson = (shot.prompt.promptJson as Prisma.JsonValue | null) || null;
  const explicitCharacterNames = extractCharacterNamesFromPromptJson(promptJson);
  const matchedCharacters = explicitCharacterNames.length > 0
    ? projectCharacters.filter((character) => explicitCharacterNames.includes(character.name))
    : projectCharacters.filter((character) => shot.prompt?.promptText.includes(character.name));
  const relevantCharacters = matchedCharacters.length > 0 ? matchedCharacters : projectCharacters.slice(0, 1);
  const lockText = buildCharacterLockText(relevantCharacters);
  const enhancedPrompt = [
    shot.prompt.promptText,
    lockText,
    relevantCharacters.length > 0 ? `本镜头只允许出现角色：${relevantCharacters.map((character) => character.name).join("、")}` : "",
  ].filter(Boolean).join("\n\n");

  await updateShotStatus(shot, WorkflowStatus.IMAGE_GENERATING);

  const startedAt = new Date();
  const imgJob = await prisma.workflowJob.create({
    data: {
      projectId: shot.episodeScript.projectId,
      episodeScriptId: shot.episodeScriptId,
      shotId,
      jobType: "image_generate",
      status: WorkflowStatus.IMAGE_GENERATING,
      provider: process.env.IMAGE_PROVIDER || "siliconflow",
      model: process.env.SILICONFLOW_IMAGE_MODEL || process.env.OPENAI_IMAGE_MODEL || "Kwai-Kolors/Kolors",
      estimatedCost: new Prisma.Decimal(creditCosts.image_generate),
      startedAt,
    },
  });

  await consumeCredits({
    userId,
    projectId: shot.episodeScript.projectId,
    generationJobId: imgJob.id,
    jobType: "image_generate",
    reason: `生成分镜图 镜头${shot.shotNo}`,
  });

  const result = await generateImageWithRouting(enhancedPrompt, {
    size: "1024x1792",
  });
  if (result.error || !result.url) {
    await prisma.storyShot.update({ where: { id: shot.id }, data: { status: WorkflowStatus.FAILED } });
    await prisma.workflowJob.update({
      where: { id: imgJob.id },
      data: {
        status: WorkflowStatus.FAILED,
        finishedAt: new Date(),
        durationMs: Date.now() - startedAt.getTime(),
        errorCode: "AI_PROVIDER_FAILED",
        errorMessage: result.error || "Image generation failed",
      },
    });
    await refundCredits({
      userId,
      projectId: shot.episodeScript.projectId,
      generationJobId: imgJob.id,
      jobType: "image_generate",
      reason: `退款-分镜图生成失败 镜头${shot.shotNo}`,
    });
    throw new WorkflowError(result.error || "Image generation failed", "INTERNAL_ERROR");
  }

  const latestVersion = await prisma.shotImageAsset.count({ where: { shotId } });
  await prisma.shotImageAsset.updateMany({ where: { shotId }, data: { isActive: false } });
  const asset = await prisma.shotImageAsset.create({
    data: {
      shotId,
      version: latestVersion + 1,
      imageUrl: result.url,
      provider: process.env.IMAGE_PROVIDER || "siliconflow",
      model: process.env.SILICONFLOW_IMAGE_MODEL || process.env.OPENAI_IMAGE_MODEL || "Kwai-Kolors/Kolors",
      metadata: asJson({
        basePrompt: shot.prompt.promptText,
        enhancedPrompt,
        characterNames: relevantCharacters.map((character) => character.name),
        lockText: lockText || null,
      }),
      isActive: true,
    },
  });

  await prisma.storyShot.update({ where: { id: shot.id }, data: { status: WorkflowStatus.IMAGE_READY } });
  const durationMs = Date.now() - startedAt.getTime();
  await prisma.workflowJob.update({
    where: { id: imgJob.id },
    data: {
      status: WorkflowStatus.DONE,
      actualCost: new Prisma.Decimal(creditCosts.image_generate),
      finishedAt: new Date(),
      durationMs,
      outputPayload: asJson({ shotImageAssetId: asset.id, version: asset.version }),
    },
  });

  return asset;
}

export async function generateShotVideo(shotId: string, userIdOverride?: string) {
  const userId = userIdOverride || (await requireUserId());
  const shot = await prisma.storyShot.findFirst({
    where: {
      id: shotId,
      episodeScript: {
        project: { userId },
      },
    },
    include: {
      prompt: true,
      episodeScript: true,
      imageAssets: {
        where: { isActive: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });
  if (!shot) throw new WorkflowError("Shot not found", "NOT_FOUND");

  const activeImage = shot.imageAssets[0];
  if (!activeImage?.imageUrl) {
    throw new WorkflowError("图生视频必须先有分镜图，禁止直接文生视频", "TEXT_TO_VIDEO_FORBIDDEN");
  }

  await updateShotStatus(shot, WorkflowStatus.VIDEO_GENERATING);

  const startedAt = new Date();
  const vidJob = await prisma.workflowJob.create({
    data: {
      projectId: shot.episodeScript.projectId,
      episodeScriptId: shot.episodeScriptId,
      shotId,
      jobType: "video_generate",
      status: WorkflowStatus.VIDEO_GENERATING,
      provider: process.env.VIDEO_PROVIDER || "siliconflow",
      model: process.env.SILICONFLOW_VIDEO_MODEL || process.env.KLING_MODEL || "Wan-AI/Wan2.2-I2V-A14B",
      estimatedCost: new Prisma.Decimal(creditCosts.video_generate),
      startedAt,
    },
  });

  await consumeCredits({
    userId,
    projectId: shot.episodeScript.projectId,
    generationJobId: vidJob.id,
    jobType: "video_generate",
    reason: `生成视频片段 镜头${shot.shotNo}`,
  });

  const result = await generateVideoWithRouting(
    shot.prompt?.promptText || shot.continuityHint || "",
    activeImage.imageUrl,
    { duration: Math.round(shot.durationSeconds) || 3 }
  );

  if (result.error || !result.url) {
    await prisma.storyShot.update({ where: { id: shot.id }, data: { status: WorkflowStatus.FAILED } });
    await prisma.workflowJob.update({
      where: { id: vidJob.id },
      data: {
        status: WorkflowStatus.FAILED,
        finishedAt: new Date(),
        durationMs: Date.now() - startedAt.getTime(),
        errorCode: "AI_PROVIDER_FAILED",
        errorMessage: result.error || "Video generation failed",
      },
    });
    await refundCredits({
      userId,
      projectId: shot.episodeScript.projectId,
      generationJobId: vidJob.id,
      jobType: "video_generate",
      reason: `退款-视频生成失败 镜头${shot.shotNo}`,
    });
    throw new WorkflowError(result.error || "Video generation failed", "INTERNAL_ERROR");
  }

  const latestVersion = await prisma.shotVideoAsset.count({ where: { shotId } });
  await prisma.shotVideoAsset.updateMany({ where: { shotId }, data: { isActive: false } });
  const asset = await prisma.shotVideoAsset.create({
    data: {
      shotId,
      version: latestVersion + 1,
      videoUrl: result.url,
      provider: process.env.VIDEO_PROVIDER || "siliconflow",
      model: process.env.SILICONFLOW_VIDEO_MODEL || process.env.KLING_MODEL || "Wan-AI/Wan2.2-I2V-A14B",
      isActive: true,
      metadata: asJson({ taskId: result.taskId, remoteStatus: result.status }),
    },
  });

  await prisma.storyShot.update({ where: { id: shot.id }, data: { status: WorkflowStatus.VIDEO_READY } });
  const durationMs = Date.now() - startedAt.getTime();
  await prisma.workflowJob.update({
    where: { id: vidJob.id },
    data: {
      status: WorkflowStatus.DONE,
      actualCost: new Prisma.Decimal(creditCosts.video_generate),
      finishedAt: new Date(),
      durationMs,
      outputPayload: asJson({ shotVideoAssetId: asset.id, version: asset.version }),
    },
  });

  return asset;
}

export async function retryShot(shotId: string, mode: RetryMode) {
  const userId = await requireUserId();
  const shot = await prisma.storyShot.findFirst({
    where: {
      id: shotId,
      episodeScript: {
        project: { userId },
      },
    },
  });
  if (!shot) throw new WorkflowError("Shot not found", "NOT_FOUND");

  if (mode === "prompt") {
    await prisma.storyShot.update({ where: { id: shotId }, data: { status: WorkflowStatus.PROMPT_READY } });
    return { status: WorkflowStatus.PROMPT_READY };
  }
  if (mode === "image") {
    await prisma.storyShot.update({ where: { id: shotId }, data: { status: WorkflowStatus.IMAGE_READY } });
    return generateShotImage(shotId);
  }
  return generateShotVideo(shotId);
}

export async function renderProject(projectId: string, episodeNo: number) {
  const userId = await requireUserId();
  const project = await prisma.storyProject.findFirst({ where: { id: projectId, userId } });
  if (!project) throw new WorkflowError("Project not found", "NOT_FOUND");

  const episode = await prisma.storyEpisodeScript.findUnique({
    where: { projectId_episodeNo: { projectId, episodeNo } },
    include: {
      shots: {
        include: {
          prompt: true,
          videoAssets: {
            where: { isActive: true },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
          audioAssets: {
            where: { isActive: true },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
        orderBy: { shotNo: "asc" },
      },
    },
  });

  if (!episode) throw new WorkflowError("Episode not found", "NOT_FOUND");

  const missing = episode.shots.find((s) => s.videoAssets.length === 0);
  if (missing) {
    throw new WorkflowError(`镜头 ${missing.shotNo} 缺少视频片段`, "INVALID_STATE");
  }

  await runBasicQcForEpisodeShots(episode.shots, false);

  for (const shot of episode.shots) {
    if (shot.status !== WorkflowStatus.VIDEO_READY && shot.status !== WorkflowStatus.QC_PASS) {
      throw new WorkflowError(`镜头 ${shot.shotNo} 状态不允许合成: ${shot.status}`, "INVALID_STATE");
    }
    await prisma.storyShot.update({ where: { id: shot.id }, data: { status: WorkflowStatus.LOCKED_FOR_RENDER } });
  }

  const startedAt = new Date();
  const job = await prisma.workflowJob.create({
    data: {
      projectId,
      episodeScriptId: episode.id,
      jobType: "render",
      status: WorkflowStatus.IMAGE_GENERATING,
      estimatedCost: new Prisma.Decimal(creditCosts.render),
      startedAt,
    },
  });

  await consumeCredits({
    userId,
    projectId,
    generationJobId: job.id,
    jobType: "render",
    reason: `合成整集 第${episodeNo}集（无配音版）`,
  });

  let rendered: Awaited<ReturnType<typeof renderEpisodeVideo>>;
  try {
    rendered = await renderEpisodeVideo({
      projectId,
      episodeNo,
      withAudio: false,
      segments: episode.shots.map((s) => ({
        videoUrl: s.videoAssets[0].videoUrl,
        audioUrl: s.audioAssets[0]?.audioUrl || null,
      })),
    });
  } catch (error) {
    await prisma.storyShot.updateMany({
      where: { id: { in: episode.shots.map((s) => s.id) } },
      data: { status: WorkflowStatus.FAILED },
    });
    await prisma.workflowJob.update({
      where: { id: job.id },
      data: {
        status: WorkflowStatus.FAILED,
        finishedAt: new Date(),
        durationMs: durationSince(startedAt),
        errorMessage: error instanceof Error ? error.message : "视频合成失败",
      },
    });
    await refundCredits({
      userId,
      projectId,
      generationJobId: job.id,
      jobType: "render",
      reason: `退款-合成失败 第${episodeNo}集`,
    });
    throw new WorkflowError(error instanceof Error ? error.message : "视频合成失败", "INTERNAL_ERROR");
  }

  const output = await prisma.renderOutput.create({
    data: {
      projectId,
      episodeNo,
      status: WorkflowStatus.DONE,
      fileUrl: rendered.fileUrl,
      metadata: asJson({
        mode: rendered.mode,
        fileKey: rendered.fileKey,
        shotCount: episode.shots.length,
        segments: episode.shots.map((s) => s.videoAssets[0]?.videoUrl),
        audios: episode.shots.map((s) => s.audioAssets[0]?.audioUrl || null),
      }),
    },
  });

  await prisma.storyShot.updateMany({
    where: { id: { in: episode.shots.map((s) => s.id) } },
    data: { status: WorkflowStatus.DONE },
  });

  await prisma.workflowJob.update({
    where: { id: job.id },
    data: {
      status: WorkflowStatus.DONE,
      actualCost: new Prisma.Decimal(creditCosts.render),
      finishedAt: new Date(),
      durationMs: durationSince(startedAt),
      outputPayload: asJson({ renderOutputId: output.id }),
    },
  });

  return output;
}

export async function getProjectStatus(projectId: string) {
  const userId = await requireUserId();
  const project = await prisma.storyProject.findFirst({
    where: { id: projectId, userId },
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
  if (!project) throw new WorkflowError("Project not found", "NOT_FOUND");

  return project;
}

export async function dubProjectEpisode(projectId: string, episodeNo: number) {
  const userId = await requireUserId();
  const project = await prisma.storyProject.findFirst({
    where: { id: projectId, userId },
    include: { characters: { select: { name: true, metadata: true } } },
  });
  if (!project) throw new WorkflowError("Project not found", "NOT_FOUND");

  const episode = await prisma.storyEpisodeScript.findFirst({
    where: { projectId, episodeNo, project: { userId } },
    include: {
      shots: {
        include: {
          prompt: true,
          audioAssets: { where: { isActive: true }, orderBy: { createdAt: "desc" }, take: 1 },
        },
        orderBy: { shotNo: "asc" },
      },
    },
  });
  if (!episode) throw new WorkflowError("Episode not found", "NOT_FOUND");

  const voiceMap = buildVoiceMap(project.characters);
  let success = 0;
  const failed: Array<{ shotId: string; shotNo: number; error: string }> = [];

  for (const shot of episode.shots) {
    const text = pickDialogueText(
      (shot.prompt?.promptJson as Prisma.JsonValue | null) || null,
      shot.prompt?.promptText || shot.continuityHint || ""
    );
    if (!text) {
      failed.push({ shotId: shot.id, shotNo: shot.shotNo, error: "镜头缺少可配音文本" });
      continue;
    }
    const speaker = parseSpeakerName(text);
    const mappedVoice = speaker ? voiceMap.get(speaker) : undefined;

    let speech: { audioUrl?: string; error?: string };
    try {
      speech = await generateSpeechWithRouting(text, { voice: mappedVoice });
    } catch (error) {
      speech = { error: error instanceof Error ? error.message : "Unknown error" };
    }
    if (speech.error || !speech.audioUrl) {
      failed.push({ shotId: shot.id, shotNo: shot.shotNo, error: speech.error || "配音失败" });
      continue;
    }

    const latestVersion = await prisma.storyAudioAsset.count({ where: { shotId: shot.id } });
    await prisma.storyAudioAsset.updateMany({ where: { shotId: shot.id }, data: { isActive: false } });
    await prisma.storyAudioAsset.create({
      data: {
        shotId: shot.id,
        version: latestVersion + 1,
        audioUrl: speech.audioUrl,
        provider: process.env.SPEECH_PROVIDER || "siliconflow",
        model: process.env.SILICONFLOW_TTS_MODEL || process.env.VOLCANO_TTS_CLUSTER || "volcano_tts",
        isActive: true,
        metadata: asJson({ speaker, mappedVoice: mappedVoice || null }),
      },
    });
    success += 1;

    await consumeCredits({
      userId,
      projectId,
      jobType: "voice_generate",
      units: 1,
      reason: `生成配音 镜头${shot.shotNo}`,
    });
  }

  const job = await prisma.workflowJob.create({
    data: {
      projectId,
      episodeScriptId: episode.id,
      jobType: "voice_generate",
      status: failed.length ? WorkflowStatus.FAILED : WorkflowStatus.DONE,
      outputPayload: asJson({ total: episode.shots.length, success, failed }),
      errorCode: failed.length ? "PARTIAL_FAILED" : null,
      errorMessage: failed.length ? `Failed shots: ${failed.length}` : null,
    },
  });

  return { jobId: job.id, total: episode.shots.length, success, failed };
}

export async function mixProjectEpisodeAudio(projectId: string, episodeNo: number) {
  const userId = await requireUserId();
  const episode = await prisma.storyEpisodeScript.findFirst({
    where: { projectId, episodeNo, project: { userId } },
    include: {
      shots: {
        include: {
          prompt: true,
          videoAssets: { where: { isActive: true }, orderBy: { createdAt: "desc" }, take: 1 },
          audioAssets: { where: { isActive: true }, orderBy: { createdAt: "desc" }, take: 1 },
        },
        orderBy: { shotNo: "asc" },
      },
    },
  });
  if (!episode) throw new WorkflowError("Episode not found", "NOT_FOUND");

  const missingVideo = episode.shots.find((s) => s.videoAssets.length === 0);
  if (missingVideo) throw new WorkflowError(`镜头 ${missingVideo.shotNo} 缺少视频片段`, "INVALID_STATE");
  const missingAudio = episode.shots.find((s) => s.audioAssets.length === 0);
  if (missingAudio) throw new WorkflowError(`镜头 ${missingAudio.shotNo} 缺少配音音轨`, "INVALID_STATE");

  await runBasicQcForEpisodeShots(episode.shots, true);

  const startedAt = new Date();
  const job = await prisma.workflowJob.create({
    data: {
      projectId,
      episodeScriptId: episode.id,
      jobType: "audio_mix",
      status: WorkflowStatus.IMAGE_GENERATING,
      estimatedCost: new Prisma.Decimal(creditCosts.audio_mix),
      startedAt,
    },
  });

  await consumeCredits({
    userId,
    projectId,
    generationJobId: job.id,
    jobType: "audio_mix",
    reason: `合成配音版 第${episodeNo}集`,
  });

  let rendered: Awaited<ReturnType<typeof renderEpisodeVideo>>;
  try {
    rendered = await renderEpisodeVideo({
      projectId,
      episodeNo,
      withAudio: true,
      segments: episode.shots.map((s) => ({
        videoUrl: s.videoAssets[0].videoUrl,
        audioUrl: s.audioAssets[0].audioUrl,
      })),
    });
  } catch (error) {
    await prisma.workflowJob.update({
      where: { id: job.id },
      data: {
        status: WorkflowStatus.FAILED,
        finishedAt: new Date(),
        durationMs: durationSince(startedAt),
        errorMessage: error instanceof Error ? error.message : "配音版视频合成失败",
      },
    });
    await refundCredits({
      userId,
      projectId,
      generationJobId: job.id,
      jobType: "audio_mix",
      reason: `退款-合成配音版失败 第${episodeNo}集`,
    });
    throw new WorkflowError(error instanceof Error ? error.message : "配音版视频合成失败", "INTERNAL_ERROR");
  }

  const output = await prisma.renderOutput.create({
    data: {
      projectId,
      episodeNo,
      status: WorkflowStatus.DONE,
      fileUrl: rendered.fileUrl,
      metadata: asJson({
        mode: rendered.mode,
        fileKey: rendered.fileKey,
        shotCount: episode.shots.length,
        segments: episode.shots.map((s) => s.videoAssets[0]?.videoUrl),
        audios: episode.shots.map((s) => s.audioAssets[0]?.audioUrl),
      }),
    },
  });

  await prisma.workflowJob.update({
    where: { id: job.id },
    data: {
      status: WorkflowStatus.DONE,
      actualCost: new Prisma.Decimal(creditCosts.audio_mix),
      finishedAt: new Date(),
      durationMs: durationSince(startedAt),
      outputPayload: asJson({ renderOutputId: output.id }),
    },
  });

  return output;
}

export async function getJob(jobId: string) {
  const userId = await requireUserId();
  return prisma.workflowJob.findFirst({
    where: {
      id: jobId,
      project: {
        userId,
      },
    },
  });
}

export async function listProjectJobs(projectId: string, limit = 50) {
  const userId = await requireUserId();
  const project = await prisma.storyProject.findFirst({
    where: { id: projectId, userId },
    select: { id: true },
  });
  if (!project) throw new WorkflowError("Project not found", "NOT_FOUND");

  return prisma.workflowJob.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 200),
  });
}

async function getEpisodeForBatch(projectId: string, episodeNo: number, userId: string) {
  return prisma.storyEpisodeScript.findFirst({
    where: { projectId, episodeNo, project: { userId } },
    include: { shots: { orderBy: { shotNo: "asc" } } },
  });
}

export async function createBatchImageJob(projectId: string, episodeNo: number) {
  const userId = await requireUserId();
  const episode = await getEpisodeForBatch(projectId, episodeNo, userId);
  if (!episode) throw new WorkflowError("Episode not found", "NOT_FOUND");

  return prisma.workflowJob.create({
    data: {
      projectId,
      episodeScriptId: episode.id,
      jobType: "batch_image_generate",
      status: WorkflowStatus.DRAFT,
      inputPayload: asJson({ episodeNo }),
      outputPayload: asJson({ total: episode.shots.length, success: 0, failedCount: 0, failed: [] }),
    },
  });
}

export async function createBatchVideoJob(projectId: string, episodeNo: number) {
  const userId = await requireUserId();
  const episode = await getEpisodeForBatch(projectId, episodeNo, userId);
  if (!episode) throw new WorkflowError("Episode not found", "NOT_FOUND");

  return prisma.workflowJob.create({
    data: {
      projectId,
      episodeScriptId: episode.id,
      jobType: "batch_video_generate",
      status: WorkflowStatus.DRAFT,
      inputPayload: asJson({ episodeNo }),
      outputPayload: asJson({ total: episode.shots.length, success: 0, failedCount: 0, failed: [] }),
    },
  });
}

export async function batchGenerateShotImages(
  projectId: string,
  episodeNo: number,
  userIdOverride?: string,
  onProgress?: (progress: {
    total: number;
    processed: number;
    success: number;
    failed: Array<{ shotId: string; shotNo: number; error: string }>;
  }) => Promise<void> | void,
  shouldAbort?: () => Promise<boolean> | boolean
) {
  const userId = userIdOverride || (await requireUserId());
  const episode = await getEpisodeForBatch(projectId, episodeNo, userId);
  if (!episode) throw new WorkflowError("Episode not found", "NOT_FOUND");

  let success = 0;
  const failed: Array<{ shotId: string; shotNo: number; error: string }> = [];

  for (const [index, shot] of episode.shots.entries()) {
    if (await shouldAbort?.()) {
      throw new WorkflowError("Job is cancelled", "INVALID_STATE");
    }
    try {
      await generateShotImage(shot.id, userId);
      success += 1;
    } catch (error) {
      failed.push({
        shotId: shot.id,
        shotNo: shot.shotNo,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
    await onProgress?.({
      total: episode.shots.length,
      processed: index + 1,
      success,
      failed,
    });
  }

  return { total: episode.shots.length, success, failed };
}

export async function batchGenerateShotVideos(
  projectId: string,
  episodeNo: number,
  userIdOverride?: string,
  onProgress?: (progress: {
    total: number;
    processed: number;
    success: number;
    failed: Array<{ shotId: string; shotNo: number; error: string }>;
  }) => Promise<void> | void,
  shouldAbort?: () => Promise<boolean> | boolean
) {
  const userId = userIdOverride || (await requireUserId());
  const episode = await getEpisodeForBatch(projectId, episodeNo, userId);
  if (!episode) throw new WorkflowError("Episode not found", "NOT_FOUND");

  let success = 0;
  const failed: Array<{ shotId: string; shotNo: number; error: string }> = [];

  for (const [index, shot] of episode.shots.entries()) {
    if (await shouldAbort?.()) {
      throw new WorkflowError("Job is cancelled", "INVALID_STATE");
    }
    try {
      await generateShotVideo(shot.id, userId);
      success += 1;
    } catch (error) {
      failed.push({
        shotId: shot.id,
        shotNo: shot.shotNo,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
    await onProgress?.({
      total: episode.shots.length,
      processed: index + 1,
      success,
      failed,
    });
  }

  return { total: episode.shots.length, success, failed };
}

export async function runWorkflowJob(jobId: string) {
  const userId = await requireUserId();
  const job = await prisma.workflowJob.findFirst({
    where: { id: jobId, project: { userId } },
  });
  if (!job) throw new WorkflowError("Job not found", "NOT_FOUND");
  return runWorkflowJobInternal(job, userId);
}

export async function ensureWorkflowJobOwned(jobId: string) {
  const userId = await requireUserId();
  const job = await prisma.workflowJob.findFirst({
    where: { id: jobId, project: { userId } },
    select: { id: true },
  });
  if (!job) throw new WorkflowError("Job not found", "NOT_FOUND");
  return { id: job.id };
}

export async function runWorkflowJobAsSystem(jobId: string) {
  const job = await prisma.workflowJob.findUnique({
    where: { id: jobId },
    include: { project: { select: { userId: true } } },
  });
  if (!job) throw new WorkflowError("Job not found", "NOT_FOUND");
  return runWorkflowJobInternal(job, job.project.userId);
}

async function runWorkflowJobInternal(
  job: {
    id: string;
    jobType: string;
    status: WorkflowStatus;
    errorCode: string | null;
    inputPayload: Prisma.JsonValue | null;
    projectId: string;
  },
  userId: string
) {
  if (job.status === WorkflowStatus.DONE) return { job, skipped: true };
  if (job.status === WorkflowStatus.FAILED && job.errorCode === "CANCELLED") {
    throw new WorkflowError("Job is cancelled", "INVALID_STATE");
  }

  const payload = (job.inputPayload || {}) as { episodeNo?: number };
  const episodeNo = Number(payload.episodeNo || 0);
  if (!episodeNo) {
    await prisma.workflowJob.update({
      where: { id: job.id },
      data: {
        status: WorkflowStatus.FAILED,
        errorCode: "VALIDATION_ERROR",
        errorMessage: "Job input invalid: missing episodeNo",
      },
    });
    throw new WorkflowError("Job input invalid: missing episodeNo", "VALIDATION_ERROR");
  }

  await prisma.workflowJob.update({
    where: { id: job.id },
    data: { status: WorkflowStatus.IMAGE_GENERATING, errorCode: null, errorMessage: null },
  });

  try {
    const updateProgress = async (progress: {
      total: number;
      processed: number;
      success: number;
      failed: Array<{ shotId: string; shotNo: number; error: string }>;
    }) => {
      await prisma.workflowJob.update({
        where: { id: job.id },
        data: {
          outputPayload: asJson({
            ...progress,
            failedCount: progress.failed.length,
            progressPercent: Math.floor((progress.processed / Math.max(progress.total, 1)) * 100),
          }),
        },
      });
    };

    const shouldAbort = async () => {
      const current = await prisma.workflowJob.findUnique({
        where: { id: job.id },
        select: { errorCode: true },
      });
      return current?.errorCode === "CANCELLED";
    };

    const result =
      job.jobType === "batch_image_generate"
        ? await batchGenerateShotImages(job.projectId, episodeNo, userId, updateProgress, shouldAbort)
        : job.jobType === "batch_video_generate"
          ? await batchGenerateShotVideos(job.projectId, episodeNo, userId, updateProgress, shouldAbort)
          : null;

    if (!result) throw new WorkflowError(`Unsupported jobType: ${job.jobType}`, "INVALID_STATE");

    await prisma.workflowJob.update({
      where: { id: job.id },
      data: {
        status: result.failed.length ? WorkflowStatus.FAILED : WorkflowStatus.DONE,
        outputPayload: asJson(result),
        errorCode: result.failed.length ? "PARTIAL_FAILED" : null,
        errorMessage: result.failed.length ? `Failed shots: ${result.failed.length}` : null,
      },
    });

    return { result };
  } catch (error) {
    await prisma.workflowJob.update({
      where: { id: job.id },
      data: {
        status: WorkflowStatus.FAILED,
        errorCode: "JOB_EXEC_FAILED",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      },
    });
    throw error;
  }
}

export async function cancelWorkflowJob(jobId: string) {
  const userId = await requireUserId();
  const job = await prisma.workflowJob.findFirst({
    where: { id: jobId, project: { userId } },
  });
  if (!job) throw new WorkflowError("Job not found", "NOT_FOUND");
  if (job.status === WorkflowStatus.DONE) throw new WorkflowError("Done job cannot be cancelled", "INVALID_STATE");

  await prisma.workflowJob.update({
    where: { id: jobId },
    data: {
      status: WorkflowStatus.FAILED,
      errorCode: "CANCELLED",
      errorMessage: "Cancelled by user",
    },
  });
  return { cancelled: true };
}

export async function retryWorkflowJob(jobId: string) {
  const userId = await requireUserId();
  const job = await prisma.workflowJob.findFirst({
    where: { id: jobId, project: { userId } },
  });
  if (!job) throw new WorkflowError("Job not found", "NOT_FOUND");

  await prisma.workflowJob.update({
    where: { id: jobId },
    data: {
      retries: { increment: 1 },
      status: WorkflowStatus.DRAFT,
      errorCode: null,
      errorMessage: null,
    },
  });

  return { queued: true, jobId };
}
