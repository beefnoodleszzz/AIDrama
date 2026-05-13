import { z } from "zod";
import { generateTextWithRouting } from "@/server/ai";
import { WorkflowError } from "./errors";

export const StoryboardShotSchema = z.object({
  shotNo: z.number().int().min(1).max(999),
  durationSeconds: z.number().min(1).max(30),
  shotType: z.string().min(1).max(50),
  cameraLanguage: z.string().min(1).max(100),
  continuityHint: z.string().min(1).max(500),
  promptText: z.string().min(5).max(1000),
  dialogue: z.union([z.string(), z.array(z.string())]).optional(),
  characterNames: z.array(z.string().min(1).max(30)).optional(),
});

export const StoryboardSchema = z.array(StoryboardShotSchema);

export type StoryboardShot = z.infer<typeof StoryboardShotSchema>;
const CharacterDraftSchema = z.object({
  name: z.string().min(1).max(30),
  appearanceLock: z.string().max(300).optional().nullable(),
  outfitLock: z.string().max(300).optional().nullable(),
  negativePrompt: z.string().max(300).optional().nullable(),
});
const CharacterDraftListSchema = z.array(CharacterDraftSchema);
export type CharacterDraft = z.infer<typeof CharacterDraftSchema>;
const MIN_STORYBOARD_SHOTS = 4;
const DEFAULT_STORYBOARD_SHOTS_MIN = 8;
const DEFAULT_STORYBOARD_SHOTS_MAX = 12;
const MAX_STORYBOARD_SHOTS = 20;

type ShotRange = { min: number; max: number };

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

function inferShotRangeFromScript(rawScript: string): ShotRange {
  // 识别如“45-60秒”“时长目标 60 秒”等常见写法。
  const rangeMatch = rawScript.match(/(\d{1,3})\s*[-~到]\s*(\d{1,3})\s*秒/);
  const singleMatch = rawScript.match(/(?:时长目标|目标时长|时长)\s*[:：]?\s*(\d{1,3})\s*秒/);

  let targetSeconds: number | null = null;
  if (rangeMatch) {
    const a = Number(rangeMatch[1]);
    const b = Number(rangeMatch[2]);
    if (Number.isFinite(a) && Number.isFinite(b) && a > 0 && b > 0) {
      targetSeconds = Math.round((a + b) / 2);
    }
  } else if (singleMatch) {
    const a = Number(singleMatch[1]);
    if (Number.isFinite(a) && a > 0) targetSeconds = a;
  }

  if (!targetSeconds) {
    return { min: DEFAULT_STORYBOARD_SHOTS_MIN, max: DEFAULT_STORYBOARD_SHOTS_MAX };
  }

  // 约束每镜头 2-6 秒：镜头数约为 total/6 到 total/2，稍加缓冲。
  const min = clamp(Math.round(targetSeconds / 6), MIN_STORYBOARD_SHOTS, MAX_STORYBOARD_SHOTS);
  const max = clamp(Math.round(targetSeconds / 2), min + 1, MAX_STORYBOARD_SHOTS);
  return { min, max };
}

function splitScriptIntoBeats(rawScript: string): string[] {
  const normalized = rawScript
    .replace(/\r/g, "")
    .replace(/[【】\[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const parts = normalized
    .split(/(?<=[。！？!?；;])/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts : [normalized || "角色在场景中推进剧情。"];
}

function normalizeCharacterName(name: string) {
  return name.replace(/[（(].*?[）)]/g, "").replace(/\s+/g, "").trim();
}

function fallbackExtractCharacters(rawScript: string): CharacterDraft[] {
  const characters: CharacterDraft[] = [];
  const seen = new Set<string>();
  const addCharacter = (name: string, appearanceLock?: string) => {
    const normalized = normalizeCharacterName(name);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    characters.push({
      name: normalized,
      appearanceLock: appearanceLock?.trim() || null,
      outfitLock: null,
      negativePrompt: null,
    });
  };

  const bulletMatches = rawScript.matchAll(/[-•]\s*([\u4e00-\u9fa5A-Za-z0-9·]{2,20})[：:]\s*([^\n]+)/g);
  for (const match of bulletMatches) {
    addCharacter(match[1], match[2]);
  }

  const dialogueMatches = rawScript.matchAll(/(^|\n)\s*([\u4e00-\u9fa5]{2,6})[：:]/g);
  for (const match of dialogueMatches) {
    addCharacter(match[2]);
  }

  return characters.slice(0, 8);
}

function buildFallbackStoryboard(rawScript: string, shotRange: ShotRange): StoryboardShot[] {
  const beats = splitScriptIntoBeats(rawScript);
  const target = clamp(Math.max(shotRange.min, 8), MIN_STORYBOARD_SHOTS, MAX_STORYBOARD_SHOTS);
  const shotTypes = ["全景", "中景", "近景", "特写"] as const;
  const cameraMoves = ["固定", "推进", "平移", "跟拍"] as const;

  const list: StoryboardShot[] = [];
  for (let i = 0; i < target; i += 1) {
    const beat = beats[i % beats.length];
    const prev = i === 0 ? "开场建立信息" : `承接镜头${i}`;
    list.push({
      shotNo: i + 1,
      durationSeconds: i % 3 === 0 ? 5 : 4,
      shotType: shotTypes[i % shotTypes.length],
      cameraLanguage: cameraMoves[i % cameraMoves.length],
      continuityHint: `${prev}，人物外观与服装保持一致`,
      promptText: `写实电影感，单一动作，主体清晰。${beat}`,
    });
  }
  return list;
}

function parseJsonArray(input: string): unknown {
  const cleaned = input.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const first = cleaned.indexOf("[");
  const last = cleaned.lastIndexOf("]");
  const jsonText = first >= 0 && last > first ? cleaned.slice(first, last + 1) : cleaned;
  const parsed = JSON.parse(jsonText);
  return parsed;
}

function normalizeStoryboardPayload(input: unknown): unknown {
  if (Array.isArray(input)) return input;
  if (input && typeof input === "object") {
    const obj = input as Record<string, unknown>;
    const candidates = [obj.shots, obj.storyboard, obj.data, obj.items, obj.result, obj.output];
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) return candidate;
    }

    // 单镜头对象：自动包装为数组
    if (
      typeof obj.shotNo === "number" ||
      typeof obj.promptText === "string" ||
      typeof obj.durationSeconds === "number"
    ) {
      return [obj];
    }

    // 常见嵌套形态：{ episodes: [{ shots: [...] }] } / { data: { shots: [...] } }
    for (const value of Object.values(obj)) {
      if (Array.isArray(value)) {
        if (
          value.length > 0 &&
          value.every((item) => item && typeof item === "object" && !Array.isArray(item))
        ) {
          const first = value[0] as Record<string, unknown>;
          if (
            typeof first.shotNo === "number" ||
            typeof first.promptText === "string" ||
            typeof first.durationSeconds === "number"
          ) {
            return value;
          }
          for (const nested of value) {
            if (nested && typeof nested === "object" && !Array.isArray(nested)) {
              const nestedObj = nested as Record<string, unknown>;
              if (Array.isArray(nestedObj.shots)) return nestedObj.shots;
              if (Array.isArray(nestedObj.storyboard)) return nestedObj.storyboard;
            }
          }
        }
      }
      if (value && typeof value === "object" && !Array.isArray(value)) {
        const nestedNormalized = normalizeStoryboardPayload(value);
        if (Array.isArray(nestedNormalized)) return nestedNormalized;
      }
    }
  }
  return input;
}

async function repairStoryboardToArray(rawText: string): Promise<unknown> {
  const response = await generateTextWithRouting(
    "你是JSON修复器。把输入内容修复成分镜JSON数组。只输出JSON数组，不要解释。",
    [
      "每个元素必须包含字段：shotNo,durationSeconds,shotType,cameraLanguage,continuityHint,promptText。",
      "如果输入是对象，请提取其中可用镜头；如果只有单镜头对象，包装成数组；如果缺字段，按最合理方式补全。",
      "输入内容如下：",
      rawText,
    ].join("\n"),
    { jsonMode: true, temperature: 0.1 }
  );

  if (response.error) return null;

  try {
    return normalizeStoryboardPayload(parseJsonArray(response.text));
  } catch {
    return null;
  }
}

async function requestStoryboard(rawScript: string, strict: boolean, shotRange: ShotRange): Promise<string> {
  const system = strict
    ? `你是短剧导演。把剧本转成结构化分镜JSON数组。
硬性要求：
1) 仅输出纯 JSON 数组，不要代码块、不要解释。
2) 镜头数必须在 ${shotRange.min}-${shotRange.max} 条。
3) 每个元素必须有：shotNo,durationSeconds,shotType,cameraLanguage,continuityHint,promptText。
4) 每个元素尽量补充：dialogue, characterNames。
5) 同一角色在不同镜头里名称必须完全一致，promptText 要重复角色名。
6) 禁止换脸，禁止同一角色的发型、服装、脸型在镜头间漂移。
7) shotNo 必须连续递增。`
    : "你是短剧导演。把剧本转成结构化分镜JSON数组。每个镜头必须有：shotNo(序号)、durationSeconds(时长秒)、shotType(镜头类型)、cameraLanguage(运镜语言)、continuityHint(连贯提示)、promptText(图生视频提示词)。";

  const user = strict
    ? `输出字段: shotNo,durationSeconds,shotType,cameraLanguage,continuityHint,promptText,dialogue,characterNames。
镜头数要求: ${shotRange.min}-${shotRange.max}。
剧本:
${rawScript}`
    : `输出字段: shotNo,durationSeconds,shotType,cameraLanguage,continuityHint,promptText,dialogue,characterNames。\n剧本:\n${rawScript}`;

  const response = await generateTextWithRouting(system, user, {
    jsonMode: true,
    temperature: strict ? 0.2 : 0.4,
  });
  if (response.error) {
    throw new WorkflowError(`AI 生成失败: ${response.error}`, "AI_PROVIDER_FAILED");
  }
  return response.text;
}

export async function extractCharactersFromScript(rawScript: string): Promise<CharacterDraft[]> {
  const response = await generateTextWithRouting(
    "你是短剧角色拆解器。请从剧本文本中提取角色列表，只输出 JSON 数组。",
    [
      "输出字段：name, appearanceLock, outfitLock, negativePrompt。",
      "如果剧本里没有明确外观，就保留为空字符串。",
      "角色名必须稳定、去重，不要把场景名或道具名识别成角色。",
      "剧本如下：",
      rawScript,
    ].join("\n"),
    { jsonMode: true, temperature: 0.2 }
  );

  if (!response.error) {
    try {
      const parsed = JSON.parse(response.text);
      const result = CharacterDraftListSchema.safeParse(parsed);
      if (result.success && result.data.length > 0) {
        return result.data.map((item) => ({
          ...item,
          name: normalizeCharacterName(item.name),
        })).filter((item) => item.name);
      }
    } catch {
      // fall through to heuristic extraction
    }
  }

  return fallbackExtractCharacters(rawScript);
}

export async function generateStructuredStoryboard(rawScript: string): Promise<StoryboardShot[]> {
  const shotRange = inferShotRangeFromScript(rawScript);
  const attempts = [false, true, true];
  let lastError: WorkflowError | null = null;

  for (let i = 0; i < attempts.length; i += 1) {
    const strict = attempts[i];
    const responseText = await requestStoryboard(rawScript, strict, shotRange);

    let parsed: unknown;
    try {
      parsed = normalizeStoryboardPayload(parseJsonArray(responseText));
    } catch {
      lastError = new WorkflowError("AI 返回格式解析失败，请重试", "AI_OUTPUT_INVALID");
      continue;
    }

    let result = StoryboardSchema.safeParse(parsed);
    if (!result.success) {
      const repaired = await repairStoryboardToArray(responseText);
      if (repaired) {
        parsed = repaired;
        result = StoryboardSchema.safeParse(parsed);
      }
    }

    if (!result.success) {
      const issues = result.error.issues.slice(0, 3);
      const detail = issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("；");
      const shape =
        parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? `对象键: ${Object.keys(parsed as Record<string, unknown>).slice(0, 8).join(",") || "(empty)"}`
          : Array.isArray(parsed)
            ? `数组长度: ${parsed.length}`
            : `类型: ${typeof parsed}`;
      lastError = new WorkflowError(`AI 输出结构异常（${detail}；${shape}）`, "AI_OUTPUT_INVALID");
      continue;
    }

    if (result.data.length < MIN_STORYBOARD_SHOTS) {
      lastError = new WorkflowError(
        `AI 仅生成 ${result.data.length} 条分镜，低于最小要求 ${MIN_STORYBOARD_SHOTS} 条`,
        "AI_OUTPUT_INVALID"
      );
      continue;
    }

    // 强制重排 shotNo，避免模型返回跳号或重复号影响后续工作流与界面排序。
    return result.data.map((shot, index) => ({
      ...shot,
      shotNo: index + 1,
    }));
  }

  // 兜底：AI 多轮失败或仅返回极少镜头时，使用本地规则生成可执行分镜，避免流程阻塞。
  const fallback = buildFallbackStoryboard(rawScript, shotRange);
  if (fallback.length >= MIN_STORYBOARD_SHOTS) return fallback;

  throw lastError || new WorkflowError("AI 分镜生成失败，请重试", "AI_OUTPUT_INVALID");
}
