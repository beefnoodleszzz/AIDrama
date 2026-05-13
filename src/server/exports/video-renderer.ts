import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { generateFilename, uploadFile } from "@/server/oss";

const execFileAsync = promisify(execFile);

export type RenderSegment = {
  videoUrl: string;
  audioUrl?: string | null;
};

export type RenderEpisodeInput = {
  projectId: string;
  episodeNo: number;
  segments: RenderSegment[];
  withAudio: boolean;
};

export type RenderEpisodeResult = {
  fileUrl: string;
  fileKey: string;
  mode: "ffmpeg_concat" | "ffmpeg_concat_audio";
  segmentCount: number;
};

function escapeConcatPath(filePath: string) {
  return filePath.replace(/'/g, "'\\''");
}

async function runFfmpeg(args: string[]) {
  try {
    await execFileAsync(process.env.FFMPEG_PATH || "ffmpeg", args, {
      maxBuffer: 1024 * 1024 * 20,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "FFmpeg 执行失败";
    throw new Error(message);
  }
}

async function downloadAsset(url: string, filePath: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`素材下载失败: ${response.status} ${response.statusText}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(filePath, buffer);
}

export async function renderEpisodeVideo(input: RenderEpisodeInput): Promise<RenderEpisodeResult> {
  if (input.segments.length === 0) {
    throw new Error("没有可合成的视频片段");
  }
  if (input.withAudio && input.segments.some((segment) => !segment.audioUrl)) {
    throw new Error("配音版合成要求每个镜头都有音频");
  }

  const workDir = await mkdtemp(path.join(tmpdir(), "ai-drama-render-"));
  try {
    const normalizedDir = path.join(workDir, "normalized");
    await mkdir(normalizedDir, { recursive: true });

    const normalizedFiles: string[] = [];
    for (const [index, segment] of input.segments.entries()) {
      const videoPath = path.join(workDir, `video-${index}.mp4`);
      const audioPath = input.withAudio ? path.join(workDir, `audio-${index}.audio`) : null;
      const outputPath = path.join(normalizedDir, `segment-${index}.mp4`);

      await downloadAsset(segment.videoUrl, videoPath);
      if (audioPath && segment.audioUrl) {
        await downloadAsset(segment.audioUrl, audioPath);
      }

      const args = audioPath
        ? [
            "-y",
            "-i",
            videoPath,
            "-i",
            audioPath,
            "-map",
            "0:v:0",
            "-map",
            "1:a:0",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "23",
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            "-shortest",
            "-movflags",
            "+faststart",
            outputPath,
          ]
        : [
            "-y",
            "-i",
            videoPath,
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "23",
            "-an",
            "-movflags",
            "+faststart",
            outputPath,
          ];

      await runFfmpeg(args);
      normalizedFiles.push(outputPath);
    }

    const concatListPath = path.join(workDir, "concat.txt");
    await writeFile(
      concatListPath,
      normalizedFiles.map((filePath) => `file '${escapeConcatPath(filePath)}'`).join("\n")
    );

    const finalPath = path.join(workDir, "final.mp4");
    await runFfmpeg([
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      concatListPath,
      "-c",
      "copy",
      "-movflags",
      "+faststart",
      finalPath,
    ]);

    const file = await readFile(finalPath);
    const key = generateFilename(
      input.projectId,
      `renders/episode-${input.episodeNo}`,
      "mp4"
    );
    const uploaded = await uploadFile(file, key, "video/mp4");

    return {
      fileUrl: uploaded.url,
      fileKey: uploaded.key,
      mode: input.withAudio ? "ffmpeg_concat_audio" : "ffmpeg_concat",
      segmentCount: input.segments.length,
    };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
