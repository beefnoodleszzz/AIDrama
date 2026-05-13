import { 
  AiProvider, 
  ImageCapable,
  VideoCapable,
  SpeechCapable,
  AiResponse, 
  ImageResponse, 
  VideoResponse,
  SpeechResponse,
  TextGenerationOptions,
  ImageGenerationOptions,
  VideoGenerationOptions,
  SpeechGenerationOptions 
} from "./types";

// Re-export types for convenience
export type { ImageCapable, VideoCapable, SpeechCapable };

// DeepSeek Provider (Text)
export class DeepSeekProvider extends AiProvider {
  name = "deepseek";
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string) {
    super();
    this.apiKey = apiKey;
    this.baseUrl = "https://api.deepseek.com/v1";
  }

  async generateText(
    systemPrompt: string,
    userPrompt: string,
    options?: TextGenerationOptions
  ): Promise<AiResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: options?.model || "deepseek-chat",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: options?.temperature ?? 0.7,
          max_tokens: options?.maxTokens ?? 4096,
          response_format: options?.jsonMode
            ? { type: "json_object" }
            : undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        return { text: "", error: `DeepSeek API Error: ${error}` };
      }

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content || "";

      return {
        text,
        usage: data.usage
          ? {
              promptTokens: data.usage.prompt_tokens,
              completionTokens: data.usage.completion_tokens,
              totalTokens: data.usage.total_tokens,
            }
          : undefined,
      };
    } catch (error) {
      return {
        text: "",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}

// OpenAI Provider (Text + Image)
export class OpenAIProvider extends AiProvider implements ImageCapable {
  name = "openai";
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl = "https://api.openai.com/v1") {
    super();
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  async generateText(
    systemPrompt: string,
    userPrompt: string,
    options?: TextGenerationOptions
  ): Promise<AiResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: options?.model || process.env.OPENAI_TEXT_MODEL || "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: options?.temperature ?? 0.7,
          max_tokens: options?.maxTokens ?? 4096,
          response_format: options?.jsonMode ? { type: "json_object" } : undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        return { text: "", error: `OpenAI API Error: ${error}` };
      }

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content || "";

      return {
        text,
        usage: data.usage
          ? {
              promptTokens: data.usage.prompt_tokens,
              completionTokens: data.usage.completion_tokens,
              totalTokens: data.usage.total_tokens,
            }
          : undefined,
      };
    } catch (error) {
      return {
        text: "",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async generateImage(
    prompt: string,
    options?: ImageGenerationOptions
  ): Promise<ImageResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/images/generations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: options?.model || process.env.OPENAI_IMAGE_MODEL || "gpt-image-1",
          prompt,
          size: options?.size || "1024x1024",
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        return { error: `OpenAI Image API Error: ${error}` };
      }

      const data = await response.json();
      return { url: data.data?.[0]?.url };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}

// SiliconFlow Provider (Text + Image + Video)
export class SiliconFlowProvider extends AiProvider implements ImageCapable, VideoCapable, SpeechCapable {
  name = "siliconflow";
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl = "https://api.siliconflow.cn/v1") {
    super();
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  async generateText(
    systemPrompt: string,
    userPrompt: string,
    options?: TextGenerationOptions
  ): Promise<AiResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: options?.model || process.env.SILICONFLOW_TEXT_MODEL || "Qwen/Qwen3-8B",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: options?.temperature ?? 0.7,
          max_tokens: options?.maxTokens ?? 4096,
          response_format: options?.jsonMode ? { type: "json_object" } : undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        return { text: "", error: `SiliconFlow Text API Error: ${error}` };
      }

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content || "";

      return {
        text,
        usage: data.usage
          ? {
              promptTokens: data.usage.prompt_tokens ?? 0,
              completionTokens: data.usage.completion_tokens ?? 0,
              totalTokens: data.usage.total_tokens ?? 0,
            }
          : undefined,
      };
    } catch (error) {
      return {
        text: "",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async generateImage(prompt: string, options?: ImageGenerationOptions): Promise<ImageResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/images/generations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: options?.model || process.env.SILICONFLOW_IMAGE_MODEL || "Kwai-Kolors/Kolors",
          prompt,
          image_size: options?.size || process.env.SILICONFLOW_IMAGE_SIZE || "1024x1024",
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        return { error: `SiliconFlow Image API Error: ${error}` };
      }

      const data = await response.json();
      const imageUrl = data.images?.[0]?.url || data.data?.[0]?.url;
      if (!imageUrl) {
        return { error: "SiliconFlow image API returned no image URL" };
      }
      return { url: imageUrl };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async generateVideo(
    prompt: string,
    imageUrl?: string,
    options?: VideoGenerationOptions
  ): Promise<VideoResponse> {
    try {
      const submitPayload: Record<string, unknown> = {
        model:
          options?.model ||
          process.env.SILICONFLOW_VIDEO_MODEL ||
          (imageUrl ? "Wan-AI/Wan2.2-I2V-A14B" : "Wan-AI/Wan2.2-T2V-A14B"),
        prompt,
      };
      if (imageUrl) {
        submitPayload.image = imageUrl;
      }

      const submitRes = await fetch(`${this.baseUrl}/video/submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(submitPayload),
      });

      if (!submitRes.ok) {
        const error = await submitRes.text();
        return { error: `SiliconFlow Video Submit Error: ${error}` };
      }

      const submitData = await submitRes.json();
      const requestId = submitData.requestId || submitData.request_id;
      if (!requestId) {
        return { error: `SiliconFlow submit succeeded but no requestId: ${JSON.stringify(submitData)}` };
      }

      for (let i = 0; i < 60; i++) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        const statusRes = await fetch(`${this.baseUrl}/video/status`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({ requestId }),
        });

        if (!statusRes.ok) {
          const error = await statusRes.text();
          return { error: `SiliconFlow Video Status Error: ${error}`, taskId: String(requestId) };
        }

        const statusData = await statusRes.json();
        const status = statusData.status;
        if (status === "Succeed") {
          const url = statusData.results?.videos?.[0]?.url || statusData.results?.url;
          if (!url) {
            return { error: "Video generation succeeded but no video URL returned", taskId: String(requestId) };
          }
          return { url, taskId: String(requestId), status: "done" };
        }
        if (status === "Failed") {
          return {
            error: statusData.reason || "Video generation failed",
            taskId: String(requestId),
            status: "failed",
          };
        }
      }

      return {
        error: "SiliconFlow video generation timeout",
        taskId: String(requestId),
        status: "processing",
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async generateSpeech(
    text: string,
    options?: SpeechGenerationOptions
  ): Promise<SpeechResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/audio/speech`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: options?.model || process.env.SILICONFLOW_TTS_MODEL || "FunAudioLLM/CosyVoice2-0.5B",
          input: text,
          voice: options?.voice || process.env.SILICONFLOW_TTS_VOICE || "alex",
          response_format: "mp3",
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        return { error: `SiliconFlow Speech API Error: ${error}` };
      }

      const contentType = response.headers.get("content-type") || "";
      let audioBuffer: Buffer;
      if (contentType.includes("application/json")) {
        const data = await response.json();
        const base64 = data.audio || data.data?.audio || data.data;
        if (!base64 || typeof base64 !== "string") {
          return { error: "SiliconFlow speech API returned no audio payload" };
        }
        audioBuffer = Buffer.from(base64, "base64");
      } else {
        const arrayBuffer = await response.arrayBuffer();
        audioBuffer = Buffer.from(arrayBuffer);
      }

      const { uploadFile, generateFilename, getPublicUrl } = await import("@/server/oss");
      const filename = generateFilename("tts", "audio", "mp3");
      await uploadFile(audioBuffer, filename, "audio/mpeg");
      const audioUrl = getPublicUrl(filename);

      return { audioUrl };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}

// Tongyi (通义万相) Provider (Image)
export class TongyiProvider extends AiProvider implements ImageCapable {
  name = "tongyi";
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string) {
    super();
    this.apiKey = apiKey;
    this.baseUrl = "https://dashscope.aliyuncs.com/api/v1";
  }

  async generateText(): Promise<AiResponse> {
    return { text: "", error: "Tongyi does not support text generation" };
  }

  async generateImage(
    prompt: string,
    options?: ImageGenerationOptions
  ): Promise<ImageResponse> {
    try {
      // Submit task
      const submitResponse = await fetch(`${this.baseUrl}/services/aigc/text2image/image-synthesis`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
          "X-DashScope-Async": "enable",
        },
        body: JSON.stringify({
          model: options?.model || "wanx-v1",
          input: {
            prompt: prompt,
          },
          parameters: {
            size: options?.size || "1024*1024",
            n: 1,
          },
        }),
      });

      if (!submitResponse.ok) {
        const error = await submitResponse.text();
        return { error: `Tongyi API Error: ${error}` };
      }

      const submitData = await submitResponse.json();
      const taskId = submitData.output?.task_id;

      if (!taskId) {
        return { error: "No task ID returned" };
      }

      // Poll for result
      let attempts = 0;
      const maxAttempts = 30;

      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 2000));

        const statusResponse = await fetch(`${this.baseUrl}/tasks/${taskId}`, {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
          },
        });

        const statusData = await statusResponse.json();
        const status = statusData.output?.task_status;

        if (status === "SUCCEEDED") {
          const imageUrl = statusData.output?.results?.[0]?.url;
          return { url: imageUrl };
        }

        if (status === "FAILED") {
          return { error: statusData.output?.message || "Image generation failed" };
        }

        attempts++;
      }

      return { error: "Image generation timeout" };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}

// Kling (可灵AI) Provider (Video)
export class KlingProvider extends AiProvider implements VideoCapable {
  name = "kling";
  private accessKey?: string;
  private secretKey?: string;
  private apiKey?: string;
  private baseUrl: string;

  constructor(config: {
    accessKey?: string;
    secretKey?: string;
    apiKey?: string;
    baseUrl?: string;
  }) {
    super();
    this.accessKey = config.accessKey?.trim();
    this.secretKey = config.secretKey?.trim();
    this.apiKey = config.apiKey?.trim();
    const rawBaseUrl = (config.baseUrl || process.env.KLING_BASE_URL || "https://api.klingapi.com").trim();
    this.baseUrl = rawBaseUrl.replace(/\/+$/, "");
  }

  private async fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 25000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  private async getToken(): Promise<string> {
    if (this.apiKey) {
      return this.apiKey;
    }
    if (!this.accessKey || !this.secretKey) {
      throw new Error("Kling credentials missing: provide KLING_API_KEY or KLING_ACCESS_KEY + KLING_SECRET_KEY");
    }
    // Generate JWT token for Kling API
    const header = {
      alg: "HS256",
      typ: "JWT",
    };
    const payload = {
      iss: this.accessKey,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 1800,
      nbf: Math.floor(Date.now() / 1000) - 5,
    };

    // Simple JWT implementation
    const encode = (obj: Record<string, unknown>) => {
      return Buffer.from(JSON.stringify(obj))
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");
    };

    const token = `${encode(header)}.${encode(payload)}`;
    
    // HMAC-SHA256 signature
    const crypto = await import("crypto");
    const signature = crypto
      .createHmac("sha256", this.secretKey)
      .update(token)
      .digest("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");

    return `${token}.${signature}`;
  }

  async generateText(): Promise<AiResponse> {
    return { text: "", error: "Kling does not support text generation" };
  }

  async generateVideo(
    prompt: string,
    imageUrl?: string,
    options?: VideoGenerationOptions
  ): Promise<VideoResponse> {
    try {
      const token = await this.getToken();
      const model = options?.model || process.env.KLING_MODEL || "kling-v2.6-std";
      const duration = options?.duration === 10 ? 10 : 5;
      const aspectRatio = (options?.width || 1280) >= (options?.height || 720) ? "16:9" : "9:16";
      const baseCandidates = [this.baseUrl];

      const endpoint = imageUrl ? "/v1/videos/image2video" : "/v1/videos/text2video";
      const payload: Record<string, unknown> = {
        model,
        prompt,
        duration,
        aspect_ratio: aspectRatio,
        mode: process.env.KLING_MODE || "standard",
      };
      if (imageUrl) payload.image = imageUrl;

      let submitResponse: Response | null = null;
      let lastSubmitError: unknown = null;
      let usedBaseUrl = this.baseUrl;
      for (const baseUrl of baseCandidates) {
        try {
          const res = await this.fetchWithTimeout(`${baseUrl}${endpoint}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(payload),
          });
          submitResponse = res;
          usedBaseUrl = baseUrl;
          break;
        } catch (error) {
          lastSubmitError = error;
        }
      }

      if (!submitResponse) {
        const message = lastSubmitError instanceof Error ? lastSubmitError.message : "fetch failed";
        return {
          error: `Kling fetch failed: ${message}. 请检查 KLING_BASE_URL/网络连通性。`,
        };
      }

      if (!submitResponse.ok) {
        const error = await submitResponse.text();
        if (submitResponse.status === 401 && error.includes("\"code\":1002")) {
          return {
            error: `Kling 鉴权失败(1002)：当前 Authorization 无效。请确认网关域名与凭据类型一致（API Key 或 AccessKey/SecretKey），并重新生成/替换凭据。响应: ${error}`,
          };
        }
        return { error: `Kling API Error(${usedBaseUrl}): ${error}` };
      }

      const submitData = await submitResponse.json();
      const taskId =
        submitData.task_id ||
        submitData.id ||
        submitData.data?.task_id ||
        submitData.data?.id;

      if (!taskId) {
        return { error: `No task ID returned: ${JSON.stringify(submitData)}` };
      }

      // Poll for result
      let attempts = 0;
      const maxAttempts = 60; // Video generation takes longer

      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 5000));

        const statusResponse = await this.fetchWithTimeout(`${usedBaseUrl}/v1/videos/${taskId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const statusData = await statusResponse.json();
        const status = statusData.status || statusData.data?.task_status || statusData.data?.status;

        if (status === "succeed" || status === "succeeded" || status === "completed") {
          const videoUrl =
            statusData.video_url ||
            statusData.result?.video_url ||
            statusData.output?.video_url ||
            statusData.data?.task_result?.videos?.[0]?.url;
          return { 
            url: videoUrl,
            taskId: String(taskId),
            status: "done",
          };
        }

        if (status === "failed" || status === "error") {
          return { 
            error: statusData.error?.message || statusData.message || statusData.data?.task_status_msg || "Video generation failed",
            taskId: String(taskId),
            status: "failed",
          };
        }

        attempts++;
      }

      return { 
        error: "Video generation timeout",
        taskId: String(taskId),
        status: "processing",
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}

// Runway Provider (Video) - Integration placeholder for route A
export class RunwayProvider extends AiProvider implements VideoCapable {
  name = "runway";
  private apiKey: string;
  private baseUrl: string;

  constructor(config: { apiKey: string; baseUrl?: string }) {
    super();
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl || process.env.RUNWAY_BASE_URL || "https://api.dev.runwayml.com").replace(/\/+$/, "");
  }

  async generateText(): Promise<AiResponse> {
    return { text: "", error: "Runway does not support text generation" };
  }

  async generateVideo(): Promise<VideoResponse> {
    void this.apiKey;
    void this.baseUrl;
    return {
      error: "Runway provider is reserved but not implemented yet. Please complete submit/poll integration first.",
      status: "failed",
    };
  }
}

// Volcano (火山引擎) Provider (TTS) - 使用API Key认证
export class VolcanoTTSProvider extends AiProvider implements SpeechCapable {
  name = "volcano";
  private token: string;
  private appId: string;
  private cluster: string;
  private defaultVoiceType: string;

  constructor(config: {
    token: string;
    appId: string;
    cluster?: string;
    defaultVoiceType?: string;
  }) {
    super();
    this.token = config.token;
    this.appId = config.appId;
    this.cluster = config.cluster || "volcano_tts";
    this.defaultVoiceType = config.defaultVoiceType || "zh_female_shuangkuaisisi_moon_bigtts";
  }

  async generateText(): Promise<AiResponse> {
    return { text: "", error: "Volcano TTS does not support text generation" };
  }

  async generateSpeech(
    text: string,
    options?: SpeechGenerationOptions
  ): Promise<SpeechResponse> {
    try {
      const response = await fetch("https://openspeech.bytedance.com/api/v1/tts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer;${this.token}`,
        },
        body: JSON.stringify({
          app: {
            appid: this.appId,
            token: this.token,
            cluster: this.cluster,
          },
          user: {
            uid: "user_id",
          },
          audio: {
            voice_type: options?.voice || this.defaultVoiceType,
            encoding: "mp3",
            speed_ratio: options?.speed || 1.0,
            volume_ratio: 1.0,
            pitch_ratio: options?.pitch || 1.0,
          },
          request: {
            reqid: `req_${Date.now()}`,
            text: text,
            operation: "query",
          },
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        return { error: `Volcano TTS Error: ${error}` };
      }

      const data = await response.json();

      if (data.code !== 3000) {
        return { error: data.message || "TTS generation failed" };
      }

      // Convert base64 to audio buffer
      const audioBuffer = Buffer.from(data.data, "base64");
      
      // Upload to Aliyun OSS
      const { uploadFile, generateFilename, getPublicUrl } = await import("@/server/oss");
      const filename = generateFilename("tts", "audio", "mp3");
      await uploadFile(audioBuffer, filename, "audio/mpeg");
      const audioUrl = getPublicUrl(filename);

      return { audioUrl };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}

// ElevenLabs Provider (Speech) - Integration placeholder for route A
export class ElevenLabsProvider extends AiProvider implements SpeechCapable {
  name = "elevenlabs";
  private apiKey: string;
  private baseUrl: string;
  private defaultVoiceId: string;

  constructor(config: { apiKey: string; baseUrl?: string; defaultVoiceId?: string }) {
    super();
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl || process.env.ELEVENLABS_BASE_URL || "https://api.elevenlabs.io").replace(/\/+$/, "");
    this.defaultVoiceId = config.defaultVoiceId || process.env.ELEVENLABS_VOICE_ID || "";
  }

  async generateText(): Promise<AiResponse> {
    return { text: "", error: "ElevenLabs does not support text generation" };
  }

  async generateSpeech(): Promise<SpeechResponse> {
    void this.apiKey;
    void this.baseUrl;
    void this.defaultVoiceId;
    return {
      error: "ElevenLabs provider is reserved but not implemented yet. Please complete TTS API integration first.",
    };
  }
}
