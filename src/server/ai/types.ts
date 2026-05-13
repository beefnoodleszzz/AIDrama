// AI Provider Types
export interface TextGenerationOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}

export interface ImageGenerationOptions {
  model?: string;
  size?: string;
  quality?: string;
  style?: string;
}

export interface VideoGenerationOptions {
  model?: string;
  duration?: number;
  fps?: number;
  width?: number;
  height?: number;
}

export interface SpeechGenerationOptions {
  model?: string;
  voice?: string;
  speed?: number;
  pitch?: number;
}

export interface AiResponse {
  text: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  error?: string;
}

export interface ImageResponse {
  url?: string;
  base64?: string;
  error?: string;
}

export interface VideoResponse {
  url?: string;
  taskId?: string;
  status?: "pending" | "processing" | "done" | "failed";
  error?: string;
}

export interface SpeechResponse {
  audioUrl?: string;
  audioBuffer?: Buffer;
  error?: string;
}

// Abstract AI Provider
export abstract class AiProvider {
  abstract name: string;
  
  abstract generateText(
    systemPrompt: string,
    userPrompt: string,
    options?: TextGenerationOptions
  ): Promise<AiResponse>;
}

// Optional capabilities interfaces
export interface ImageCapable {
  generateImage(prompt: string, options?: ImageGenerationOptions): Promise<ImageResponse>;
}

export interface VideoCapable {
  generateVideo(prompt: string, imageUrl?: string, options?: VideoGenerationOptions): Promise<VideoResponse>;
}

export interface SpeechCapable {
  generateSpeech(text: string, options?: SpeechGenerationOptions): Promise<SpeechResponse>;
}

// Provider configuration
export interface ProviderConfig {
  textProvider: "deepseek" | "openai" | "siliconflow";
  imageProvider: "tongyi" | "openai" | "runway" | "siliconflow";
  videoProvider: "kling" | "runway" | "siliconflow";
  speechProvider: "siliconflow" | "volcano" | "elevenlabs";
  routingPolicy?: "primary_only" | "fallback_on_error";
  fallbackProvider?: string;
  fallbackModel?: string;
}

// Get provider config from environment
export function getProviderConfig(): ProviderConfig {
  return {
    textProvider: (process.env.TEXT_PROVIDER as ProviderConfig["textProvider"]) || "siliconflow",
    imageProvider: (process.env.IMAGE_PROVIDER as ProviderConfig["imageProvider"]) || "siliconflow",
    videoProvider: (process.env.VIDEO_PROVIDER as ProviderConfig["videoProvider"]) || "siliconflow",
    speechProvider: (process.env.SPEECH_PROVIDER as ProviderConfig["speechProvider"]) || "siliconflow",
    routingPolicy: (process.env.ROUTING_POLICY as ProviderConfig["routingPolicy"]) || "primary_only",
    fallbackProvider: process.env.FALLBACK_PROVIDER || "",
    fallbackModel: process.env.FALLBACK_MODEL || "",
  };
}
