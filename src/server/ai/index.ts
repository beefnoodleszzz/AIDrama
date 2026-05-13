import { AiProvider, getProviderConfig } from "./types";
import type { AiResponse, ImageCapable, ImageResponse, SpeechCapable, SpeechResponse, TextGenerationOptions, VideoCapable, VideoGenerationOptions, VideoResponse } from "./types";
import {
  DeepSeekProvider,
  OpenAIProvider,
  SiliconFlowProvider,
  TongyiProvider,
  KlingProvider,
  RunwayProvider,
  VolcanoTTSProvider,
  ElevenLabsProvider,
} from "./providers";

// Export types
export type { ImageCapable, VideoCapable, SpeechCapable };

function getProviderByName(name: string): AiProvider {
  switch (name) {
    case "siliconflow": {
      const apiKey = process.env.SILICONFLOW_API_KEY;
      if (!apiKey) throw new Error("SiliconFlow is not configured: missing SILICONFLOW_API_KEY");
      return new SiliconFlowProvider(apiKey, process.env.SILICONFLOW_BASE_URL);
    }
    case "openai": {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error("OpenAI is not configured: missing OPENAI_API_KEY");
      return new OpenAIProvider(apiKey, process.env.OPENAI_BASE_URL);
    }
    case "deepseek": {
      const apiKey = process.env.DEEPSEEK_API_KEY;
      if (!apiKey) throw new Error("DeepSeek is not configured: missing DEEPSEEK_API_KEY");
      return new DeepSeekProvider(apiKey);
    }
    case "tongyi":
      if (!process.env.TONGYI_API_KEY) throw new Error("Tongyi is not configured: missing TONGYI_API_KEY");
      return new TongyiProvider(process.env.TONGYI_API_KEY);
    case "kling":
      return getKlingProvider();
    case "runway": {
      const apiKey = process.env.RUNWAY_API_KEY;
      if (!apiKey) throw new Error("Runway is not configured: missing RUNWAY_API_KEY");
      return new RunwayProvider({ apiKey, baseUrl: process.env.RUNWAY_BASE_URL });
    }
    case "volcano": {
      const token = process.env.VOLCANO_TTS_TOKEN;
      const appId = process.env.VOLCANO_TTS_APPID;
      const cluster = process.env.VOLCANO_TTS_CLUSTER || "volcano_tts";
      const defaultVoiceType = process.env.VOLCANO_TTS_VOICE_TYPE || "zh_female_shuangkuaisisi_moon_bigtts";
      if (!token || !appId) throw new Error("Volcano TTS is not configured: missing VOLCANO_TTS_APPID or VOLCANO_TTS_TOKEN");
      return new VolcanoTTSProvider({ token, appId, cluster, defaultVoiceType });
    }
    case "elevenlabs": {
      const apiKey = process.env.ELEVENLABS_API_KEY;
      if (!apiKey) throw new Error("ElevenLabs is not configured: missing ELEVENLABS_API_KEY");
      return new ElevenLabsProvider({
        apiKey,
        baseUrl: process.env.ELEVENLABS_BASE_URL,
        defaultVoiceId: process.env.ELEVENLABS_VOICE_ID,
      });
    }
    default:
      throw new Error(`Unsupported provider: ${name}`);
  }
}

// Get providers based on configuration
export function getTextProvider(): AiProvider {
  const config = getProviderConfig();
  return getProviderByName(config.textProvider);
}

export function getImageProvider(): AiProvider {
  const config = getProviderConfig();
  return getProviderByName(config.imageProvider);
}

export function getVideoProvider(): AiProvider {
  const config = getProviderConfig();
  return getProviderByName(config.videoProvider);
}

function getKlingProvider(): AiProvider {
  const apiKey = process.env.KLING_API_KEY?.trim();
  const accessKey = process.env.KLING_ACCESS_KEY?.trim();
  const secretKey = process.env.KLING_SECRET_KEY?.trim();
  const baseUrl = process.env.KLING_BASE_URL?.trim().replace(/\/+$/, "");

  if (!apiKey && (!accessKey || !secretKey)) {
    throw new Error("Kling is not configured: set KLING_API_KEY or KLING_ACCESS_KEY + KLING_SECRET_KEY");
  }

  return new KlingProvider({
    apiKey,
    accessKey,
    secretKey,
    baseUrl,
  });
}

export function getSpeechProvider(): AiProvider {
  const config = getProviderConfig();
  return getProviderByName(config.speechProvider);
}

function shouldFallback() {
  return (process.env.ROUTING_POLICY || "primary_only") === "fallback_on_error";
}

export async function generateTextWithRouting(systemPrompt: string, userPrompt: string, options?: TextGenerationOptions): Promise<AiResponse> {
  const primary = getTextProvider();
  const first = await primary.generateText(systemPrompt, userPrompt, options);
  if (!first.error || !shouldFallback()) return first;

  const fallbackProvider = process.env.TEXT_FALLBACK_PROVIDER || process.env.FALLBACK_PROVIDER;
  if (!fallbackProvider) return first;
  const fallback = getProviderByName(fallbackProvider);
  const second = await fallback.generateText(systemPrompt, userPrompt, {
    ...options,
    model: process.env.TEXT_FALLBACK_MODEL || process.env.FALLBACK_MODEL || options?.model,
  });
  return second.error ? first : second;
}

export async function generateImageWithRouting(prompt: string, options?: { model?: string; size?: string }): Promise<ImageResponse> {
  const primary = getImageProvider() as unknown as ImageCapable;
  const first = await primary.generateImage(prompt, options);
  if (!first.error || !shouldFallback()) return first;
  const fallbackProvider = process.env.IMAGE_FALLBACK_PROVIDER || process.env.FALLBACK_PROVIDER;
  if (!fallbackProvider) return first;
  const fallback = getProviderByName(fallbackProvider) as unknown as ImageCapable;
  const second = await fallback.generateImage(prompt, {
    ...options,
    model: process.env.IMAGE_FALLBACK_MODEL || process.env.FALLBACK_MODEL || options?.model,
  });
  return second.error ? first : second;
}

export async function generateVideoWithRouting(prompt: string, imageUrl?: string, options?: VideoGenerationOptions): Promise<VideoResponse> {
  const primary = getVideoProvider() as unknown as VideoCapable;
  const first = await primary.generateVideo(prompt, imageUrl, options);
  if (!first.error || !shouldFallback()) return first;
  const fallbackProvider = process.env.VIDEO_FALLBACK_PROVIDER || process.env.FALLBACK_PROVIDER;
  if (!fallbackProvider) return first;
  const fallback = getProviderByName(fallbackProvider) as unknown as VideoCapable;
  const second = await fallback.generateVideo(prompt, imageUrl, {
    ...options,
    model: process.env.VIDEO_FALLBACK_MODEL || process.env.FALLBACK_MODEL || options?.model,
  });
  return second.error ? first : second;
}

export async function generateSpeechWithRouting(text: string, options?: { model?: string; voice?: string; speed?: number; pitch?: number }): Promise<SpeechResponse> {
  const primary = getSpeechProvider() as unknown as SpeechCapable;
  const first = await primary.generateSpeech(text, options);
  if (!first.error || !shouldFallback()) return first;
  const fallbackProvider = process.env.SPEECH_FALLBACK_PROVIDER || process.env.FALLBACK_PROVIDER;
  if (!fallbackProvider) return first;
  const fallback = getProviderByName(fallbackProvider) as unknown as SpeechCapable;
  const second = await fallback.generateSpeech(text, {
    ...options,
    model: process.env.SPEECH_FALLBACK_MODEL || process.env.FALLBACK_MODEL || options?.model,
  });
  return second.error ? first : second;
}

// Core Prompt Library
export const PROMPTS = {
  PROJECT_OUTLINE: {
    system: `你是一位资深的短剧编剧专家，擅长创作高冲突、快节奏、强反转的爆款短剧。
请根据用户提供的信息，生成一个详细的短剧项目大纲。
要求：
1. 故事要有强烈的冲突和反转
2. 人物关系要复杂有张力
3. 每集结尾要有钩子
4. 符合短视频平台的节奏特点`,
    user: (title: string, genre: string, brief: string) => `
项目标题：${title}
题材：${genre}
核心设定：${brief}

请输出以下 JSON 格式：
{
  "storySummary": "故事梗概（200字以内）",
  "highlights": ["卖点1", "卖点2", "卖点3"],
  "mainConflict": "核心冲突描述",
  "tone": "整体基调",
  "episodeHooks": ["第1集结尾钩子", "第2集结尾钩子", "第3集结尾钩子"]
}
`,
  },

  EPISODE_SCRIPT: {
    system: `你是一位专业的短剧剧本作家。请根据项目大纲，创作具体的一集剧本。
要求：
1. 对白精炼，符合短视频节奏
2. 情绪饱满，冲突强烈
3. 每集结尾必须有强烈的钩子
4. 场景描述要具体可执行`,
    user: (projectInfo: string, epNo: number) => `
项目信息：${projectInfo}
当前集数：第 ${epNo} 集

请输出完整的剧本内容，包含：
- 集标题
- 本集目标
- 开场钩子
- 具体剧情（含场景描述、人物动作）
- 对白内容
- 情绪标注
- 结尾反转
`,
  },

  STORYBOARD: {
    system: `你是一位资深的短剧导演。请将剧本内容转化为专业的分镜表。
要求：
1. 每个镜头要有明确的景别和运镜
2. 画面描述要具体可执行
3. 时长要符合短视频节奏
4. 注意情绪节奏的把控`,
    user: (script: string) => `
剧本内容：${script}

请输出包含以下字段的 JSON 数组：
[{
  "shotNo": 序号,
  "shotSize": "景别（特写/近景/中景/全景/远景）",
  "cameraMotion": "镜头运动（固定/推/拉/摇/移/跟）",
  "visualDescription": "画面描述",
  "dialogue": "台词",
  "emotion": "情绪",
  "durationSeconds": 建议时长
}]
`,
  },

  CHARACTER_CARDS: {
    system: `你是一位资深的角色设计师。请基于短剧大纲，设计核心角色卡。
要求：
1. 角色要有鲜明的特点
2. 人物关系要有张力
3. 外貌描述要具体
4. 性格要有反差萌或反差感`,
    user: (projectInfo: string) => `
项目信息：${projectInfo}

请输出以下 JSON 数组格式：
[{
  "name": "角色名",
  "roleType": "主角/配角/反派",
  "ageRange": "年龄段",
  "appearance": "外貌特征描述",
  "personality": "性格特点",
  "motivation": "人物动机",
  "weakness": "人物弱点",
  "catchphrase": "口头禅（可选）",
  "visualPrompt": "用于 AI 绘图的视觉描述词"
}]
`,
  },

  SCENE_CARDS: {
    system: `你是一位资深的制片场景设计。请基于短剧大纲，提取并设计核心场景卡。
要求：
1. 场景要有代表性
2. 氛围描述要具体
3. 视觉关键词要可用于AI绘图
4. 标注适用的集数`,
    user: (projectInfo: string) => `
项目信息：${projectInfo}

请输出以下 JSON 数组格式：
[{
  "name": "场景名称",
  "sceneType": "室内/室外",
  "timeOfDay": "白天/黑夜/黄昏/黎明",
  "atmosphere": "氛围描述",
  "visualKeywords": "视觉关键词",
  "applicableEpisodes": [1, 2, 3],
  "visualPrompt": "用于 AI 绘图的视觉描述词"
}]
`,
  },

  COVER_PROMPT: {
    system: `你是一位专业的AI绘图提示词工程师。请根据短剧信息，生成高质量的封面图提示词。
要求：
1. 风格要符合短剧调性
2. 画面要有冲击力
3. 要体现故事核心元素
4. 适合竖版短视频封面`,
    user: (projectInfo: string, genre: string) => `
项目信息：${projectInfo}
题材：${genre}

请输出一个用于生成竖版封面图的英文提示词（100词以内）。
`,
  },

  VIDEO_PROMPT: {
    system: `你是一位专业的AI视频提示词工程师。请根据分镜描述，生成高质量的视频生成提示词。
要求：
1. 动作描述要清晰
2. 镜头运动要明确
3. 风格要统一
4. 时长控制在5-10秒`,
    user: (shotDescription: string, style: string) => `
分镜描述：${shotDescription}
风格要求：${style}

请输出一个用于生成短视频的提示词（中英文各一份）。
`,
  },

  SUBTITLE_SCRIPT: {
    system: `你是一位专业的字幕编辑。请将剧本内容转化为字幕稿。
要求：
1. 每句字幕不超过15个字
2. 断句要符合口语习惯
3. 标注时间码`,
    user: (script: string, durationSeconds: number) => `
剧本内容：${script}
目标时长：${durationSeconds}秒

请输出SRT格式的字幕稿。
`,
  },
};
