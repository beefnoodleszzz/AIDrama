"use client";

import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2, Clapperboard, Loader2, Sparkles, Video, ImageIcon, FileText, RefreshCw, XCircle, RotateCcw, ArrowRight, Package, Wand2, ScanText, Images, Captions, PlaySquare } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type AssetBase = { id: string; imageUrl?: string; videoUrl?: string; audioUrl?: string; version: number; isActive?: boolean; createdAt: Date };

type ShotItem = {
  id: string;
  shotNo: number;
  status: string;
  durationSeconds: number;
  prompt: { promptText: string } | null;
  imageAssets: Array<AssetBase & { imageUrl: string }>;
  videoAssets: Array<AssetBase & { videoUrl: string }>;
  audioAssets: Array<AssetBase & { audioUrl: string }>;
};

type EpisodeItem = {
  id: string;
  episodeNo: number;
  title?: string | null;
  rawScript: string;
  shots: ShotItem[];
};

type ProjectData = {
  id: string;
  title: string;
  metadata?: unknown;
  episodes: EpisodeItem[];
  characters: Array<{
    id: string;
    name: string;
    appearanceLock?: string | null;
    outfitLock?: string | null;
    negativePrompt?: string | null;
    referenceImageUrl?: string | null;
    metadata?: unknown;
  }>;
  renderOutputs: Array<{
    id: string;
    episodeNo: number;
    fileUrl: string;
    createdAt: Date;
    metadata?: unknown;
  }>;
};

type WorkflowJob = {
  id: string;
  jobType: string;
  status: string;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  episodeScriptId?: string | null;
  shotId?: string | null;
  outputPayload?: unknown;
};

type ExportJob = {
  id: string;
  format: "xlsx" | "pdf" | "csv" | "zip" | string;
  status: "queued" | "running" | "done" | "failed" | "cancelled" | string;
  fileUrl: string | null;
  errorMessage: string | null;
  retries: number;
  createdAt: string;
};
const CREDIT_COSTS: Record<string, number> = {
  image_generate: 2,
  video_generate: 20,
  voice_generate: 1,
  render: 3,
  audio_mix: 5,
} as const;

type JobErrorCategory = "all" | "quota" | "network" | "model" | "asset" | "other";
type WorkspaceStage = "script" | "storyboard" | "image" | "video" | "audio" | "render";
type GuidedStep = "season" | "script" | "storyboard" | "image" | "video" | "audio" | "render";

const doneStates = new Set(["VIDEO_READY", "QC_PASS", "LOCKED_FOR_RENDER", "DONE"]);
const failedStates = new Set(["FAILED", "QC_FAIL"]);
type ShotFilter = "all" | "pending" | "failed" | "done" | "missing-image" | "missing-video" | "missing-audio";

function statusLabel(status: string) {
  const map: Record<string, string> = {
    DRAFT: "排队中",
    PROMPT_READY: "分镜词完成",
    IMAGE_GENERATING: "处理中",
    IMAGE_READY: "分镜图完成",
    VIDEO_GENERATING: "处理中",
    VIDEO_READY: "视频片段完成",
    QC_PENDING: "待质检",
    QC_PASS: "质检通过",
    QC_FAIL: "质检失败",
    LOCKED_FOR_RENDER: "待合成",
    DONE: "已完成",
    FAILED: "失败",
  };
  return map[status] || status;
}

function statusTone(status: string) {
  if (failedStates.has(status)) return "destructive" as const;
  if (doneStates.has(status)) return "default" as const;
  return "secondary" as const;
}

function matchesFilter(shot: ShotItem, filter: ShotFilter) {
  if (filter === "all") return true;
  if (filter === "failed") return failedStates.has(shot.status);
  if (filter === "done") return doneStates.has(shot.status);
  if (filter === "missing-image") return shot.imageAssets.length === 0;
  if (filter === "missing-video") return shot.videoAssets.length === 0;
  if (filter === "missing-audio") return shot.audioAssets.length === 0;
  return !doneStates.has(shot.status) && !failedStates.has(shot.status);
}

function isJobRunning(status: string) {
  return status === "DRAFT" || status === "IMAGE_GENERATING" || status === "VIDEO_GENERATING";
}

function jobTypeLabel(jobType: string) {
  const map: Record<string, string> = {
    script_import: "剧本导入",
    script_generate: "AI 编剧",
    storyboard_generate: "分镜生成",
    image_generate: "镜头生图",
    video_generate: "镜头图生视频",
    batch_image_generate: "批量生图",
    batch_video_generate: "批量图生视频",
    voice_generate: "批量自动配音",
    audio_mix: "音轨混合",
  };
  return map[jobType] || jobType;
}

function classifyJobError(text: string): Exclude<JobErrorCategory, "all"> {
  const lowered = text.toLowerCase();
  if (lowered.includes("quota") || lowered.includes("rate limit") || lowered.includes("余额")) return "quota";
  if (lowered.includes("timeout") || lowered.includes("network") || lowered.includes("econn") || lowered.includes("fetch")) return "network";
  if (lowered.includes("model") || lowered.includes("provider")) return "model";
  if (lowered.includes("图生视频必须先有分镜图") || lowered.includes("not found") || lowered.includes("素材")) return "asset";
  return "other";
}

function categoryLabel(category: JobErrorCategory) {
  const map: Record<JobErrorCategory, string> = {
    all: "全部失败",
    quota: "配额限制",
    network: "网络超时",
    model: "模型能力",
    asset: "素材缺失",
    other: "其他错误",
  };
  return map[category];
}

function characterVoiceFromMetadata(metadata: unknown) {
  const m = metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : null;
  return (typeof m?.voice === "string" && m.voice) || (typeof m?.ttsVoice === "string" && m.ttsVoice) || "";
}

function actionCopy(action: string | null) {
  if (!action) return null;
  const exact: Record<string, string> = {
    import: "正在保存当前剧本",
    "import-storyboard": "正在保存剧本并生成分镜与角色",
    "ai-script": "正在根据项目主题与前文连续生成本集剧本",
    storyboard: "正在生成结构化分镜",
    "batch-image": "正在为当前分集批量生图",
    "batch-video": "正在为当前分集批量图生视频",
    dub: "正在为当前分集生成配音",
    mix: "正在合成配音版成片",
    render: "正在合成整集成片",
    "save-characters": "正在保存角色锁定词与音色",
    "add-character": "正在新增角色卡",
    "season-plan": "正在生成全剧圣经与分集大纲",
  };
  if (exact[action]) return exact[action];
  if (action.startsWith("img-")) return "正在生成当前镜头分镜图";
  if (action.startsWith("vid-")) return "正在生成当前镜头视频片段";
  if (action.startsWith("retry-")) return "正在重试失败任务";
  if (action.startsWith("export-")) return "正在创建导出任务";
  return "正在执行操作";
}

function getActiveAsset<T extends AssetBase>(assets: T[]) {
  return assets.find((item) => item.isActive) || assets[0] || null;
}

function stageIcon(stage: WorkspaceStage) {
  const map: Record<WorkspaceStage, typeof FileText> = {
    script: ScanText,
    storyboard: Wand2,
    image: Images,
    video: PlaySquare,
    audio: Captions,
    render: Package,
  };
  return map[stage];
}

function shotAssetSummary(shot: ShotItem) {
  return {
    hasImage: shot.imageAssets.length > 0,
    hasVideo: shot.videoAssets.length > 0,
    hasAudio: shot.audioAssets.length > 0,
  };
}

function shotFilterLabel(filter: ShotFilter) {
  const map: Record<ShotFilter, string> = {
    all: "全部",
    pending: "待处理",
    failed: "失败",
    done: "已完成",
    "missing-image": "缺图",
    "missing-video": "缺视频",
    "missing-audio": "缺音频",
  };
  return map[filter];
}

function guidedStepLabel(step: GuidedStep) {
  const map: Record<GuidedStep, string> = {
    season: "AI 生成全剧大纲",
    script: "AI 生成本集剧本",
    storyboard: "生成分镜",
    image: "批量生图",
    video: "批量图生视频",
    audio: "自动配音",
    render: "输出成片",
  };
  return map[step];
}

function readSeasonPlan(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const seasonPlan = (metadata as Record<string, unknown>).seasonPlan;
  if (!seasonPlan || typeof seasonPlan !== "object" || Array.isArray(seasonPlan)) return null;
  return seasonPlan as {
    logline?: string;
    coreConflict?: string;
    episodeOutlines?: Array<{
      episodeNo: number;
      title: string;
      objective: string;
      summary: string;
      hook: string;
    }>;
  };
}

function readRenderMode(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const mode = (metadata as Record<string, unknown>).mode;
  return typeof mode === "string" ? mode : null;
}

function normalizeProjectData(input: ProjectData): ProjectData {
  return {
    ...input,
    episodes: Array.isArray(input.episodes)
      ? input.episodes.map((episode) => ({
          ...episode,
          shots: Array.isArray(episode.shots)
            ? episode.shots.map((shot) => ({
                ...shot,
                imageAssets: Array.isArray(shot.imageAssets) ? shot.imageAssets : [],
                videoAssets: Array.isArray(shot.videoAssets) ? shot.videoAssets : [],
                audioAssets: Array.isArray(shot.audioAssets) ? shot.audioAssets : [],
              }))
            : [],
        }))
      : [],
    characters: Array.isArray(input.characters) ? input.characters : [],
    renderOutputs: Array.isArray(input.renderOutputs) ? input.renderOutputs : [],
  };
}

export function Workspace({ project }: { project: ProjectData }) {
  const router = useRouter();
  const { toast } = useToast();
  const [projectState, setProjectState] = useState(() => normalizeProjectData(project));
  const [jobs, setJobs] = useState<WorkflowJob[]>([]);
  const [exportJobs, setExportJobs] = useState<ExportJob[]>([]);
  const [episodeNo, setEpisodeNo] = useState(1);
  const [episodeTitle, setEpisodeTitle] = useState("第1集");
  const [script, setScript] = useState("");
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [autoPilotEnabled, setAutoPilotEnabled] = useState(false);
  const [shotFilter, setShotFilter] = useState<ShotFilter>("all");
  const [jobErrorFilter, setJobErrorFilter] = useState<JobErrorCategory>("all");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [characterDraft, setCharacterDraft] = useState<Record<string, {
    name: string;
    appearanceLock: string;
    outfitLock: string;
    negativePrompt: string;
    referenceImageUrl: string;
    voice: string;
  }>>({});
  const [newCharacterName, setNewCharacterName] = useState("");
  const lastAutoAdvanceSignatureRef = useRef<string | null>(null);
  const autoPilotCompletionKeyRef = useRef<string | null>(null);

  const episode = useMemo(() => projectState.episodes.find((e) => e.episodeNo === episodeNo), [projectState.episodes, episodeNo]);
  const shots = useMemo(() => episode?.shots || [], [episode]);
  const filteredShots = shots.filter((s) => matchesFilter(s, shotFilter));
  const selectedShot = shots.find((s) => s.id === selectedShotId) || filteredShots[0] || shots[0] || null;
  const selectedImageAsset = selectedShot ? getActiveAsset(selectedShot.imageAssets) : null;
  const selectedVideoAsset = selectedShot ? getActiveAsset(selectedShot.videoAssets) : null;
  const selectedAudioAsset = selectedShot ? getActiveAsset(selectedShot.audioAssets) : null;
  const completedCount = shots.filter((s) => doneStates.has(s.status)).length;
  const imageReadyCount = shots.filter((s) => s.imageAssets.length > 0).length;
  const videoReadyCount = shots.filter((s) => s.videoAssets.length > 0).length;
  const audioReadyCount = shots.filter((s) => s.audioAssets.length > 0).length;
  const hasActiveBatchJob = jobs.some((j) => {
    const isBatch = j.jobType === "batch_image_generate" || j.jobType === "batch_video_generate";
    return isBatch && isJobRunning(j.status);
  });
  const blockers = useMemo(() => {
    const list: string[] = [];
    if (!episode?.rawScript?.trim()) list.push("当前分集还没有剧本内容。");
    if (episode?.rawScript?.trim() && shots.length === 0) list.push("还没有生成分镜，后续生图与图生视频无法开始。");
    if (shots.length > 0 && imageReadyCount < shots.length) list.push("存在未生图镜头，图生视频无法完整批处理。");
    if (shots.length > 0 && imageReadyCount === shots.length && videoReadyCount < shots.length) list.push("存在未出视频镜头，整集合成会被阻塞。");
    if (videoReadyCount === shots.length && shots.length > 0 && audioReadyCount < shots.length) list.push("配音尚未齐全，若要输出配音版仍需先自动配音。");
    return list;
  }, [audioReadyCount, episode?.rawScript, imageReadyCount, shots.length, videoReadyCount]);
  const storyboardPreview = shots.slice(0, 4);
  const currentEpisodeJobs = !episode?.id
    ? jobs
    : jobs.filter((job) => !job.episodeScriptId || job.episodeScriptId === episode.id);
  const busyText = actionCopy(busy);
  const seasonPlan = readSeasonPlan(projectState.metadata);
  const currentEpisodeOutline = seasonPlan?.episodeOutlines?.find((item) => item.episodeNo === episodeNo) || null;
  const persistedEpisodeTitle = episode?.title?.trim() || (episode ? `第${episode.episodeNo}集` : "第1集");
  const hasUnsavedScriptChanges = Boolean(episode) && (
    script.trim() !== (episode?.rawScript || "").trim() ||
    episodeTitle.trim() !== persistedEpisodeTitle
  );
  const currentEpisodeRender = useMemo(() => {
    const outputs = projectState.renderOutputs.filter((item) => item.episodeNo === episodeNo);
    const voicedOutput =
      outputs.find((item) => readRenderMode(item.metadata) === "ffmpeg_concat_audio") || null;
    const latestOutput = outputs[0] || null;
    return {
      voiced: voicedOutput,
      latest: latestOutput,
    };
  }, [episodeNo, projectState.renderOutputs]);
  const guidedSteps = useMemo(() => {
    const steps: Array<{ step: GuidedStep; done: boolean; active: boolean; note: string }> = [
      {
        step: "season",
        done: Boolean(seasonPlan),
        active: !seasonPlan,
        note: seasonPlan ? "已生成全剧主线与分集大纲" : "先让 AI 规划整部剧，再写当前分集",
      },
      {
        step: "script",
        done: Boolean(episode?.rawScript?.trim()),
        active: Boolean(seasonPlan) && !episode?.rawScript?.trim(),
        note: episode?.rawScript?.trim() ? "当前分集已有剧本内容" : "AI 会结合全剧主线和前文连续生成本集",
      },
      {
        step: "storyboard",
        done: shots.length > 0,
        active: Boolean(episode?.rawScript?.trim()) && shots.length === 0,
        note: shots.length > 0 ? `已生成 ${shots.length} 个镜头` : "把剧本转成结构化分镜词",
      },
      {
        step: "image",
        done: shots.length > 0 && imageReadyCount === shots.length,
        active: shots.length > 0 && imageReadyCount < shots.length,
        note: shots.length > 0 ? `已出图 ${imageReadyCount}/${shots.length}` : "等待先生成分镜",
      },
      {
        step: "video",
        done: shots.length > 0 && videoReadyCount === shots.length,
        active: shots.length > 0 && imageReadyCount === shots.length && videoReadyCount < shots.length,
        note: shots.length > 0 ? `已出视频 ${videoReadyCount}/${shots.length}` : "等待先完成生图",
      },
      {
        step: "audio",
        done: shots.length > 0 && audioReadyCount === shots.length,
        active: shots.length > 0 && videoReadyCount === shots.length && audioReadyCount < shots.length,
        note: shots.length > 0 ? `已出音轨 ${audioReadyCount}/${shots.length}` : "等待先完成图生视频",
      },
      {
        step: "render",
        done: Boolean(currentEpisodeRender.voiced),
        active: shots.length > 0 && videoReadyCount === shots.length && audioReadyCount === shots.length && !currentEpisodeRender.voiced,
        note: currentEpisodeRender.voiced ? "当前分集已有配音成片输出" : "最后合成带配音成片并导出",
      },
    ];
    const firstActiveIndex = steps.findIndex((item) => item.active);
    if (firstActiveIndex >= 0) {
      return steps.map((item, index) => ({ ...item, active: index === firstActiveIndex }));
    }
    const nextUndoneIndex = steps.findIndex((item) => !item.done);
    if (nextUndoneIndex >= 0) {
      return steps.map((item, index) => ({ ...item, active: index === nextUndoneIndex }));
    }
    return steps.map((item, index) => ({ ...item, active: index === steps.length - 1 }));
  }, [audioReadyCount, currentEpisodeRender, episode?.rawScript, imageReadyCount, seasonPlan, shots.length, videoReadyCount]);
  const nextGuidedStep = guidedSteps.find((item) => item.active)?.step || "render";
  const autoAdvanceReady =
    autoPilotEnabled &&
    busy === null &&
    !hasActiveBatchJob &&
    !currentEpisodeRender.voiced &&
    !(nextGuidedStep === "storyboard" && script.trim().length < 20);
  const autoAdvanceSignature = [
    episodeNo,
    nextGuidedStep,
    shots.length,
    imageReadyCount,
    videoReadyCount,
    audioReadyCount,
    Boolean(seasonPlan),
    Boolean(currentEpisodeRender.voiced),
  ].join(":");

  const refreshProjectStatus = useCallback(async () => {
    const [statusRes, jobsRes, exportJobsRes] = await Promise.all([
      fetch(`/api/projects/${project.id}/status`, { cache: "no-store" }),
      fetch(`/api/projects/${project.id}/jobs?limit=20`, { cache: "no-store" }),
      fetch(`/api/projects/${project.id}/exports?limit=20`, { cache: "no-store" }),
    ]);

    if (statusRes.ok) {
      const data = await statusRes.json();
      if (data?.project) {
        const normalized = normalizeProjectData(data.project as ProjectData);
        setProjectState(normalized);
        const currentEpisode = normalized.episodes.find((item) => item.episodeNo === episodeNo);
        if (currentEpisode) {
          setScript(currentEpisode.rawScript || "");
          setEpisodeTitle(currentEpisode.title?.trim() || `第${currentEpisode.episodeNo}集`);
        }
      }
    }
    if (jobsRes.ok) {
      const data = await jobsRes.json();
      if (Array.isArray(data?.jobs)) setJobs(data.jobs as WorkflowJob[]);
    }
    if (exportJobsRes.ok) {
      const data = await exportJobsRes.json();
      if (Array.isArray(data?.jobs)) setExportJobs(data.jobs as ExportJob[]);
    }
  }, [episodeNo, project.id]);

  useEffect(() => {
    const bootstrap = setTimeout(() => {
      void refreshProjectStatus();
    }, 0);
    const timer = setInterval(() => {
      void refreshProjectStatus();
    }, 4000);
    return () => {
      clearTimeout(bootstrap);
      clearInterval(timer);
    };
  }, [refreshProjectStatus]);

  useEffect(() => {
    if (!hasUnsavedScriptChanges) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedScriptChanges]);

  async function run(action: string, fn: () => Promise<void>) {
    setBusy(action);
    try {
      await fn();
      toast({ title: "操作成功", description: "状态已刷新" });
      await refreshProjectStatus();
      router.refresh();
    } catch (error) {
      const err = error as { message?: string; hint?: string };
      toast({
        title: "操作失败",
        description: err.hint || err.message || "请稍后重试",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  }

  async function createAndRunBatch(type: "image" | "video") {
    const endpoint = type === "image" ? "batch-image" : "batch-video";
    const res = await fetch(`/api/projects/${project.id}/jobs/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ episodeNo }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "创建批任务失败");
    const jobId = data.job?.id;
    if (!jobId) throw new Error("批任务创建成功但缺少 jobId");

    const runRes = await fetch(`/api/jobs/${jobId}/run`, { method: "POST" });
    const runData = await runRes.json().catch(() => ({}));
    if (!runRes.ok) throw new Error(runData.error || "批任务启动失败");
    if (runData.accepted === false && runData.reason === "already_running") {
      throw new Error("当前已有同任务在运行，请稍后再试");
    }

    toast({ title: "批任务已创建", description: `任务ID: ${jobId}` });
  }

  async function exportProject(format: "xlsx" | "pdf" | "csv" | "zip") {
    const res = await fetch(`/api/projects/${project.id}/exports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "导出失败");
    }
    const data = await res.json();
    toast({ title: "导出任务已创建", description: `格式: ${data?.job?.format || format}` });
  }

  async function activateAsset(shotId: string, assetType: "image" | "video" | "audio", assetId: string) {
    const res = await fetch(`/api/shots/${shotId}/activate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetType, assetId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "切换资产版本失败");
    }
  }

  function exportStatusLabel(status: string) {
    if (status === "queued") return "排队中";
    if (status === "running") return "处理中";
    if (status === "done") return "已完成";
    if (status === "failed") return "失败";
    if (status === "cancelled") return "已取消";
    return status;
  }

  function exportStatusTone(status: string) {
    if (status === "failed" || status === "cancelled") return "destructive" as const;
    if (status === "done") return "default" as const;
    return "secondary" as const;
  }

  async function saveScriptDraft() {
    await run("import", async () => {
      const res = await fetch(`/api/projects/${project.id}/script-import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ episodeNo, title: episodeTitle, rawScript: script, sourceType: "imported" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "剧本导入失败");
      }
    });
  }

  async function saveAndGenerateStoryboard() {
    setBusy("import-storyboard");
    try {
      const importRes = await fetch(`/api/projects/${project.id}/script-import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ episodeNo, title: episodeTitle, rawScript: script, sourceType: "imported" }),
      });
      const importData = await importRes.json().catch(() => ({}));
      if (!importRes.ok) throw new Error(importData.error || "剧本导入失败");

      const storyboardRes = await fetch(`/api/projects/${project.id}/storyboard-generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ episodeNo }),
      });
      const storyboardData = await storyboardRes.json().catch(() => ({}));
      if (!storyboardRes.ok) throw new Error(storyboardData.error || "分镜生成失败");

      toast({ title: "操作成功", description: "剧本已保存，并已生成分镜" });
      await refreshProjectStatus();
      router.refresh();
    } catch (error) {
      const err = error as { message?: string; hint?: string };
      toast({
        title: "操作失败",
        description: err.hint || err.message || "请稍后重试",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  }

  async function generateAiScriptDraft() {
    await run("ai-script", async () => {
      const res = await fetch(`/api/projects/${project.id}/script-generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ episodeNo }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "AI 剧本生成失败");
    });
  }

  async function generateSeasonBible() {
    await run("season-plan", async () => {
      const res = await fetch(`/api/projects/${project.id}/season-plan`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "全剧大纲生成失败");
    });
  }

  async function continueGuidedFlow() {
    if (nextGuidedStep === "season") {
      await generateSeasonBible();
      return;
    }
    if (nextGuidedStep === "script") {
      await generateAiScriptDraft();
      return;
    }
    if (nextGuidedStep === "storyboard") {
      await saveAndGenerateStoryboard();
      return;
    }
    if (nextGuidedStep === "image") {
      await run("batch-image", async () => createAndRunBatch("image"));
      return;
    }
    if (nextGuidedStep === "video") {
      await run("batch-video", async () => createAndRunBatch("video"));
      return;
    }
    if (nextGuidedStep === "audio") {
      await run("dub", async () => {
        const res = await fetch(`/api/projects/${project.id}/dub`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ episodeNo }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "自动配音失败");
      });
      return;
    }
    await run("mix", async () => {
      const res = await fetch(`/api/projects/${project.id}/mix`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ episodeNo }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const e: { error?: string; hint?: string } = data;
        throw Object.assign(new Error(e.error || "音轨混合失败"), { hint: e.hint });
      }
    });
  }

  const handleAutoAdvance = useEffectEvent(() => {
    void continueGuidedFlow();
  });

  useEffect(() => {
    if (!autoPilotEnabled || !currentEpisodeRender.voiced) return;
    const completionKey = `${episodeNo}:${currentEpisodeRender.voiced.id}`;
    if (autoPilotCompletionKeyRef.current === completionKey) return;
    autoPilotCompletionKeyRef.current = completionKey;
    toast({ title: "AI 短剧已生成完成", description: `第 ${episodeNo} 集配音成片已输出，可在右侧直接打开。` });
  }, [autoPilotEnabled, currentEpisodeRender.voiced, episodeNo, toast]);

  useEffect(() => {
    if (!autoAdvanceReady) return;
    if (lastAutoAdvanceSignatureRef.current === autoAdvanceSignature) return;
    lastAutoAdvanceSignatureRef.current = autoAdvanceSignature;
    handleAutoAdvance();
  }, [autoAdvanceReady, autoAdvanceSignature]);

  return (
    <div className="container py-6 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{projectState.title}</h1>
          <p className="text-sm text-muted-foreground mt-1">短剧制片工作台</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="gap-1.5"><Clapperboard className="size-3.5" />第 {episodeNo} 集</Badge>
          <Button variant="outline" size="sm" onClick={() => void refreshProjectStatus()}><RefreshCw className="mr-2 size-3.5" />刷新</Button>
        </div>
      </div>

      <section className="workspace-hero rounded-3xl border border-white/8 p-5 md:p-6">
        <div className="mb-5 grid gap-2 md:grid-cols-7">
          {guidedSteps.map((item) => {
            const Icon = item.step === "season" ? Package : stageIcon(item.step === "script" ? "script" : item.step === "storyboard" ? "storyboard" : item.step === "image" ? "image" : item.step === "video" ? "video" : item.step === "audio" ? "audio" : "render");
            return (
              <div
                key={item.step}
                className={`stage-rail ${item.active ? "stage-rail-active" : ""} ${item.done ? "stage-rail-done" : ""}`}
              >
                <div className="flex items-center gap-2">
                  <Icon className="size-4" />
                  <span className="text-sm font-medium">{guidedStepLabel(item.step)}</span>
                </div>
                <div className="mt-2 text-[11px] text-muted-foreground">{item.note}</div>
              </div>
            );
          })}
        </div>
        <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="text-[11px]">AI 自动流程</Badge>
              <div className="text-xl font-semibold tracking-tight">{guidedStepLabel(nextGuidedStep)}</div>
              <span className="text-sm text-muted-foreground">用户只需要按顺序推进，系统会自动维持整部剧主线、角色和镜头连续性。</span>
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              <div className="stage-tile">
                <div className="stage-kicker">大纲</div>
                <div className="stage-value">{seasonPlan ? "已生成" : "未生成"}</div>
                <div className="stage-note">整部剧骨架</div>
              </div>
              <div className="stage-tile">
                <div className="stage-kicker">分镜</div>
                <div className="stage-value">{shots.length}</div>
                <div className="stage-note">当前分集镜头数</div>
              </div>
              <div className="stage-tile">
                <div className="stage-kicker">图片</div>
                <div className="stage-value">{imageReadyCount}/{shots.length || 0}</div>
                <div className="stage-note">已出图镜头</div>
              </div>
              <div className="stage-tile">
                <div className="stage-kicker">视频</div>
                <div className="stage-value">{videoReadyCount}/{shots.length || 0}</div>
                <div className="stage-note">已出视频镜头</div>
              </div>
              <div className="stage-tile">
                <div className="stage-kicker">配音</div>
                <div className="stage-value">{audioReadyCount}/{shots.length || 0}</div>
                <div className="stage-note">已出音轨镜头</div>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-white/8 bg-white/4 p-4 space-y-4">
            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">下一步</div>
              <div className="mt-2 flex items-center gap-2 text-lg font-semibold">
                <ArrowRight className="size-4 text-primary" />
                {guidedStepLabel(nextGuidedStep)}
              </div>
              <div className="mt-2 text-sm text-muted-foreground">
                默认由 AI 自动往下推进。只有当你想修角色、改镜头或排查失败任务时，才需要展开高级控制。
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button className="btn-primary w-full justify-between" disabled={busy !== null || hasActiveBatchJob || (nextGuidedStep === "storyboard" && script.trim().length < 20)} onClick={() => void continueGuidedFlow()}>
                <span>
                  {nextGuidedStep === "season"
                    ? "继续下一步：先生成整部剧大纲"
                    : nextGuidedStep === "script"
                      ? "继续下一步：生成当前分集剧本"
                      : nextGuidedStep === "storyboard"
                        ? "继续下一步：生成当前分集分镜"
                        : nextGuidedStep === "image"
                          ? "继续下一步：开始批量生图"
                          : nextGuidedStep === "video"
                            ? "继续下一步：开始批量图生视频"
                            : nextGuidedStep === "audio"
                              ? "继续下一步：开始自动配音"
                              : "继续下一步：输出配音成片"}
                </span>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
              </Button>
              <Button
                variant={autoPilotEnabled ? "default" : "outline"}
                className="w-full justify-between"
                disabled={busy !== null || (nextGuidedStep === "storyboard" && script.trim().length < 20)}
                onClick={() => {
                  const nextValue = !autoPilotEnabled;
                  lastAutoAdvanceSignatureRef.current = null;
                  setAutoPilotEnabled(nextValue);
                  toast({
                    title: nextValue ? "已开启一键直出" : "已暂停一键直出",
                    description: nextValue ? "系统会从当前步骤自动推进，直到产出本集配音成片。" : "已停止自动推进，你仍可手动控制每一步。",
                  });
                }}
              >
                <span>{autoPilotEnabled ? "停止一键直出" : "一键直出 AI 短剧"}</span>
                {autoPilotEnabled ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              </Button>
            </div>
            <div className="space-y-2">
              {busyText ? (
                <div className="rounded-2xl border border-sky-400/20 bg-sky-400/10 px-3 py-2 text-xs text-sky-100">
                  {busyText}
                </div>
              ) : null}
              {autoPilotEnabled ? (
                <div className="rounded-2xl border border-sky-400/20 bg-sky-400/10 px-3 py-2 text-xs text-sky-100">
                  一键直出已开启。系统会在批任务结束后自动进入下一步，直到生成本集配音成片。
                </div>
              ) : null}
              {blockers.length === 0 ? (
                <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/8 px-3 py-2 text-xs text-emerald-100">
                  当前链路完整，可继续让 AI 自动推进。
                </div>
              ) : (
                blockers.slice(0, 2).map((blocker) => (
                  <div key={blocker} className="rounded-2xl border border-amber-400/15 bg-amber-300/8 px-3 py-2 text-xs text-amber-100">
                    {blocker}
                  </div>
                ))
              )}
              <Button variant="outline" className="w-full" onClick={() => setShowAdvanced((value) => !value)}>
                {showAdvanced ? "收起高级控制" : "展开高级控制（角色 / 镜头 / 任务）"}
              </Button>
            </div>
          </div>
        </div>
      </section>

      {showAdvanced ? <div className="grid gap-4 xl:grid-cols-[260px_1fr_340px]">
        <Card className="h-[calc(100vh-230px)] overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">镜头目录</CardTitle>
            <div className="text-xs text-muted-foreground">已完成 {completedCount}/{shots.length}</div>
            <div className="flex flex-wrap gap-1 pt-2">
              {(["all", "pending", "failed", "done", "missing-image", "missing-video", "missing-audio"] as ShotFilter[]).map((f) => (
                <Button key={f} size="sm" variant={shotFilter === f ? "default" : "outline"} onClick={() => setShotFilter(f)} className="h-7 px-2 text-xs">
                  {shotFilterLabel(f)}
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="space-y-2 overflow-y-auto max-h-[calc(100vh-360px)]">
            {filteredShots.length === 0 ? (
              <div className="text-xs text-muted-foreground border border-dashed rounded-md p-3">当前筛选条件下暂无镜头。</div>
            ) : (
              filteredShots.map((shot) => (
                <button
                  key={shot.id}
                  type="button"
                  onClick={() => setSelectedShotId(shot.id)}
                  className={`w-full text-left rounded-md border p-2 transition ${selectedShot?.id === shot.id ? "border-primary bg-primary/10" : "hover:bg-muted/40"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">镜头 {shot.shotNo}</span>
                    <Badge variant={statusTone(shot.status)} className="text-[10px]">{statusLabel(shot.status)}</Badge>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span className={`shot-dot ${shotAssetSummary(shot).hasImage ? "shot-dot-on" : ""}`} />
                    图
                    <span className={`shot-dot ${shotAssetSummary(shot).hasVideo ? "shot-dot-on" : ""}`} />
                    视
                    <span className={`shot-dot ${shotAssetSummary(shot).hasAudio ? "shot-dot-on" : ""}`} />
                    音
                  </div>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="card-enhanced">
            <CardHeader>
            <CardTitle className="text-base">剧本与分镜</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Input
                  className="input-enhanced"
                  type="number"
                  value={episodeNo}
                  min={1}
                  onChange={(e) => {
                    const nextEpisodeNo = Number(e.target.value || 1);
                    const nextEpisode = projectState.episodes.find((item) => item.episodeNo === nextEpisodeNo);
                    setEpisodeNo(nextEpisodeNo);
                    setEpisodeTitle(nextEpisode?.title?.trim() || `第${nextEpisodeNo}集`);
                    setScript(nextEpisode?.rawScript || "");
                    setSelectedShotId(null);
                  }}
                />
                <Input className="input-enhanced" value={episodeTitle} onChange={(e) => setEpisodeTitle(e.target.value)} placeholder="分集标题" />
              </div>
              {hasUnsavedScriptChanges ? (
                <div className="rounded-2xl border border-amber-400/15 bg-amber-300/8 px-3 py-2 text-xs text-amber-100">
                  当前剧本区有未保存改动。刷新、切页或关闭标签页前，建议先点击“导入剧本”保存。
                </div>
              ) : (
                <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/8 px-3 py-2 text-xs text-emerald-100">
                  当前剧本内容已与服务端同步。
                </div>
              )}
              <div className="rounded-2xl border border-white/8 bg-white/4 px-3 py-2 text-xs text-muted-foreground">
                当前分集的镜头数由系统依据剧本时长与节奏自动推导，不由用户手动填写。
              </div>
              <div className="rounded-2xl border border-white/8 bg-white/4 px-3 py-2 text-xs text-muted-foreground">
                AI 编剧会基于项目主题、梗概、总集数和前面分集内容生成当前分集，保证整部剧剧情连续，而不是只生成孤立单集。
              </div>
              {seasonPlan ? (
                <div className="rounded-2xl border border-white/8 bg-white/4 p-3 space-y-2">
                  <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">全剧圣经</div>
                  <div className="text-sm font-medium">{seasonPlan.logline || "未生成 logline"}</div>
                  {seasonPlan.coreConflict ? <div className="text-xs text-muted-foreground">主冲突：{seasonPlan.coreConflict}</div> : null}
                  {currentEpisodeOutline ? (
                    <div className="rounded-xl border border-white/8 bg-black/10 p-3 text-xs text-muted-foreground space-y-1">
                      <div className="font-medium text-foreground">{currentEpisodeOutline.title}</div>
                      <div>本集目标：{currentEpisodeOutline.objective}</div>
                      <div>本集摘要：{currentEpisodeOutline.summary}</div>
                      <div>结尾钩子：{currentEpisodeOutline.hook}</div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/3 px-3 py-3 text-xs text-muted-foreground">
                  还没有全剧圣经。先生成后，AI 编剧会按整部剧主线而不是单集孤立生成内容。
                </div>
              )}
              <div className="grid gap-3 xl:grid-cols-[1.2fr_0.8fr]">
                <Textarea value={script} onChange={(e) => setScript(e.target.value)} className="input-enhanced min-h-52" placeholder="粘贴剧本（至少20字）" />
                <div className="rounded-2xl border border-white/8 bg-white/4 p-3 space-y-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">分镜预览</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      当前分集已生成 {shots.length} 个镜头。这里展示前 4 个镜头的节奏与提示词片段。
                    </div>
                  </div>
                  {storyboardPreview.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-white/10 px-3 py-4 text-xs text-muted-foreground">
                      还没有分镜。导入剧本后点击“生成分镜”，系统会自动推导镜头数量。
                    </div>
                  ) : (
                    storyboardPreview.map((shot) => (
                      <div key={shot.id} className="rounded-xl border border-white/8 bg-black/10 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium">镜头 {shot.shotNo}</span>
                          <span className="text-[11px] text-muted-foreground">{shot.durationSeconds}s</span>
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground line-clamp-3">
                          {shot.prompt?.promptText || "等待生成分镜词"}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={busy !== null}
                  onClick={() => void generateSeasonBible()}
                >
                  {busy === "season-plan" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Package className="mr-2 size-4" />}
                  AI 生成全剧大纲
                </Button>
                <Button
                  variant="outline"
                  disabled={busy !== null}
                  onClick={() => void generateAiScriptDraft()}
                >
                  {busy === "ai-script" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <ScanText className="mr-2 size-4" />}
                  AI 生成本集剧本
                </Button>
                <Button
                  className="btn-primary"
                  disabled={busy !== null || script.trim().length < 20}
                  onClick={() => void saveAndGenerateStoryboard()}
                >
                  {busy === "import-storyboard" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Wand2 className="mr-2 size-4" />}
                  保存并生成分镜
                </Button>
                <Button variant="outline" disabled={busy !== null || script.trim().length < 20} onClick={() => void saveScriptDraft()}>
                  {busy === "import" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <FileText className="mr-2 size-4" />}
                  仅保存剧本
                </Button>
                <Button variant="outline" disabled={busy !== null || shots.length === 0} onClick={() => run("storyboard", async () => {
                  const res = await fetch(`/api/projects/${project.id}/storyboard-generate`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ episodeNo }),
                  });
                  if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    throw new Error(data.error || "分镜生成失败");
                  }
                })}>
                  {busy === "storyboard" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Sparkles className="mr-2 size-4" />}
                  重新生成分镜
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="card-enhanced">
            <CardHeader>
              <CardTitle className="text-base">角色管理（外观锁定 + 音色）</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <Input
                  className="input-enhanced h-8"
                  placeholder="新增角色名（例如：林岚）"
                  value={newCharacterName}
                  onChange={(e) => setNewCharacterName(e.target.value)}
                />
                <Button
                  variant="outline"
                  disabled={busy !== null || !newCharacterName.trim()}
                  onClick={() =>
                    run("add-character", async () => {
                      const res = await fetch(`/api/projects/${project.id}/characters`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ updates: [{ name: newCharacterName.trim() }] }),
                      });
                      if (!res.ok) {
                        const data = await res.json().catch(() => ({}));
                        throw new Error(data.error || "新增角色失败");
                      }
                      setNewCharacterName("");
                    })
                  }
                >新增角色</Button>
              </div>

              {projectState.characters.length === 0 ? <div className="text-xs text-muted-foreground">暂无角色</div> : (
                <div className="grid gap-3 xl:grid-cols-2">
                  {projectState.characters.map((c) => {
                    const d = characterDraft[c.id] || {
                      name: c.name || "",
                      appearanceLock: c.appearanceLock || "",
                      outfitLock: c.outfitLock || "",
                      negativePrompt: c.negativePrompt || "",
                      referenceImageUrl: c.referenceImageUrl || "",
                      voice: characterVoiceFromMetadata(c.metadata),
                    };
                    const readyCount = [d.voice, d.appearanceLock, d.outfitLock, d.referenceImageUrl].filter((item) => item.trim()).length;
                    const originalCharacterState = {
                      name: c.name || "",
                      appearanceLock: c.appearanceLock || "",
                      outfitLock: c.outfitLock || "",
                      negativePrompt: c.negativePrompt || "",
                      referenceImageUrl: c.referenceImageUrl || "",
                      voice: characterVoiceFromMetadata(c.metadata),
                    };
                    const hasCharacterDraftChanges =
                      d.name !== originalCharacterState.name ||
                      d.appearanceLock !== originalCharacterState.appearanceLock ||
                      d.outfitLock !== originalCharacterState.outfitLock ||
                      d.negativePrompt !== originalCharacterState.negativePrompt ||
                      d.referenceImageUrl !== originalCharacterState.referenceImageUrl ||
                      d.voice !== originalCharacterState.voice;
                    return (
                      <div key={c.id} className="rounded-2xl border border-white/8 bg-white/4 p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <div className="text-sm font-medium">{d.name || "未命名角色"}</div>
                            <div className="text-[11px] text-muted-foreground">音色、外观锁定词与参考图会影响后续生图和配音。</div>
                          </div>
                          <Badge variant={readyCount >= 2 ? "default" : "secondary"} className="text-[10px]">
                            {readyCount >= 2 ? "基础完成" : "待补充"}
                          </Badge>
                        </div>
                        {d.referenceImageUrl ? (
                          <div className="overflow-hidden rounded-xl border border-white/8 bg-black/10">
                            <Image
                              src={d.referenceImageUrl}
                              alt={`${d.name || "角色"} 参考图`}
                              width={480}
                              height={220}
                              className="h-28 w-full object-cover"
                              unoptimized
                            />
                          </div>
                        ) : (
                          <div className="rounded-xl border border-dashed border-white/10 px-3 py-4 text-[11px] text-muted-foreground">
                            还没有参考图。填入 URL 后，这里会直接预览。
                          </div>
                        )}
                        <Input className="input-enhanced h-8" value={d.name} onChange={(e) => setCharacterDraft((prev) => ({ ...prev, [c.id]: { ...d, name: e.target.value } }))} placeholder="角色名" />
                        <Input className="input-enhanced h-8" value={d.voice} onChange={(e) => setCharacterDraft((prev) => ({ ...prev, [c.id]: { ...d, voice: e.target.value } }))} placeholder="音色（voice）" />
                        <Input className="input-enhanced h-8" value={d.appearanceLock} onChange={(e) => setCharacterDraft((prev) => ({ ...prev, [c.id]: { ...d, appearanceLock: e.target.value } }))} placeholder="外貌锁定词" />
                        <Input className="input-enhanced h-8" value={d.outfitLock} onChange={(e) => setCharacterDraft((prev) => ({ ...prev, [c.id]: { ...d, outfitLock: e.target.value } }))} placeholder="服装锁定词" />
                        <Input className="input-enhanced h-8" value={d.negativePrompt} onChange={(e) => setCharacterDraft((prev) => ({ ...prev, [c.id]: { ...d, negativePrompt: e.target.value } }))} placeholder="负面约束词" />
                        <Input className="input-enhanced h-8" value={d.referenceImageUrl} onChange={(e) => setCharacterDraft((prev) => ({ ...prev, [c.id]: { ...d, referenceImageUrl: e.target.value } }))} placeholder="参考图 URL（可选）" />
                        <div className="flex justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-[10px]"
                            disabled={!hasCharacterDraftChanges}
                            onClick={() =>
                              setCharacterDraft((prev) => ({
                                ...prev,
                                [c.id]: originalCharacterState,
                              }))
                            }
                          >
                            回退本角色改动
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <Button
                variant="outline"
                disabled={busy !== null || projectState.characters.length === 0}
                onClick={() =>
                  run("save-characters", async () => {
                    const updates = projectState.characters.map((c) => {
                      const d = characterDraft[c.id] || {
                        name: c.name || "",
                        appearanceLock: c.appearanceLock || "",
                        outfitLock: c.outfitLock || "",
                        negativePrompt: c.negativePrompt || "",
                        referenceImageUrl: c.referenceImageUrl || "",
                        voice: characterVoiceFromMetadata(c.metadata),
                      };
                      return {
                        characterId: c.id,
                        name: d.name.trim() || c.name,
                        voice: d.voice.trim(),
                        appearanceLock: d.appearanceLock.trim(),
                        outfitLock: d.outfitLock.trim(),
                        negativePrompt: d.negativePrompt.trim(),
                        referenceImageUrl: d.referenceImageUrl.trim(),
                      };
                    });

                    const res = await fetch(`/api/projects/${project.id}/characters`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ updates }),
                    });
                    if (!res.ok) {
                      const data = await res.json().catch(() => ({}));
                      throw new Error(data.error || "保存角色配置失败");
                    }
                  })
                }
              >
                {busy === "save-characters" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                保存角色配置
              </Button>
            </CardContent>
          </Card>

          <Card className="card-enhanced">
            <CardHeader>
              <CardTitle className="text-base">镜头检查与单镜头修订</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!selectedShot ? (
                <div className="text-sm text-muted-foreground">请先生成分镜并选择镜头。</div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">镜头 {selectedShot.shotNo} <span className="text-xs text-muted-foreground font-normal ml-1">约{selectedShot.durationSeconds}s</span></div>
                    <Badge variant={statusTone(selectedShot.status)}>{statusLabel(selectedShot.status)}</Badge>
                  </div>
                  <Textarea
                    className="input-enhanced text-xs min-h-16"
                    value={selectedShot.prompt?.promptText || ""}
                    onChange={async (e) => {
                      const newText = e.target.value;
                      setProjectState((prev) => ({
                        ...prev,
                        episodes: prev.episodes.map((ep) =>
                          ep.episodeNo === episodeNo
                            ? {
                                ...ep,
                                shots: ep.shots.map((s) =>
                                  s.id === selectedShot.id
                                    ? { ...s, prompt: { promptText: newText } }
                                    : s
                                ),
                              }
                            : ep
                        ),
                      }));
                    }}
                    onBlur={async (e) => {
                      await fetch(`/api/shots/${selectedShot.id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ promptText: e.target.value }),
                      });
                    }}
                    placeholder="分镜词（点击编辑）"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => run(`img-${selectedShot.id}`, async () => {
                      const res = await fetch(`/api/shots/${selectedShot.id}/image-generate`, { method: "POST" });
                      const data = await res.json().catch(() => ({}));
                      if (!res.ok) { const e: {error?:string;hint?:string} = data; throw Object.assign(new Error(e.error||"分镜图生成失败"), { hint: e.hint }); }
                    })}><ImageIcon className="mr-2 size-4" />生图</Button>
                    <Button size="sm" disabled={busy !== null} onClick={() => run(`vid-${selectedShot.id}`, async () => {
                      const res = await fetch(`/api/shots/${selectedShot.id}/video-generate`, { method: "POST" });
                      const data = await res.json().catch(() => ({}));
                      if (!res.ok) { const e: {error?:string;hint?:string} = data; throw Object.assign(new Error(e.error||"视频片段生成失败"), { hint: e.hint }); }
                    })}><Video className="mr-2 size-4" />图生视频</Button>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">分镜图 {selectedImageAsset && <Badge variant="outline" className="text-[10px] ml-1">v{selectedImageAsset.version}</Badge>}</span>
                        {selectedShot.imageAssets.length > 1 && <span className="text-[10px] text-muted-foreground">共{selectedShot.imageAssets.length}个版本</span>}
                      </div>
                      <div className="rounded-md border p-2 min-h-24 flex items-center justify-center bg-muted/20">
                        {selectedImageAsset?.imageUrl ? (
                          <Image src={selectedImageAsset.imageUrl} alt={`shot-${selectedShot.shotNo}`} width={320} height={180} className="rounded object-cover w-full h-auto" unoptimized />
                        ) : (
                          <span className="text-xs text-muted-foreground">暂无分镜图</span>
                        )}
                      </div>
                      {selectedShot.imageAssets.length > 1 ? (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {selectedShot.imageAssets.map((asset) => (
                            <Button
                              key={asset.id}
                              size="sm"
                              variant={asset.isActive ? "default" : "outline"}
                              className="h-6 px-2 text-[10px]"
                              disabled={busy !== null}
                              onClick={() => run(`activate-image-${asset.id}`, async () => activateAsset(selectedShot.id, "image", asset.id))}
                            >
                              {asset.isActive ? `当前 v${asset.version}` : `设为 v${asset.version}`}
                            </Button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">视频片段 {selectedVideoAsset && <Badge variant="outline" className="text-[10px] ml-1">v{selectedVideoAsset.version}</Badge>}</span>
                        {selectedShot.videoAssets.length > 1 && <span className="text-[10px] text-muted-foreground">共{selectedShot.videoAssets.length}个版本</span>}
                      </div>
                      <div className="rounded-md border p-2 min-h-24 flex items-center justify-center bg-muted/20">
                        {selectedVideoAsset?.videoUrl ? (
                          <video controls src={selectedVideoAsset.videoUrl} className="w-full rounded" />
                        ) : (
                          <span className="text-xs text-muted-foreground">暂无视频片段</span>
                        )}
                      </div>
                      {selectedShot.videoAssets.length > 1 ? (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {selectedShot.videoAssets.map((asset) => (
                            <Button
                              key={asset.id}
                              size="sm"
                              variant={asset.isActive ? "default" : "outline"}
                              className="h-6 px-2 text-[10px]"
                              disabled={busy !== null}
                              onClick={() => run(`activate-video-${asset.id}`, async () => activateAsset(selectedShot.id, "video", asset.id))}
                            >
                              {asset.isActive ? `当前 v${asset.version}` : `设为 v${asset.version}`}
                            </Button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">配音音轨 {selectedAudioAsset && <Badge variant="outline" className="text-[10px] ml-1">v{selectedAudioAsset.version}</Badge>}</span>
                        {selectedShot.audioAssets.length > 1 && <span className="text-[10px] text-muted-foreground">共{selectedShot.audioAssets.length}个版本</span>}
                      </div>
                      <div className="rounded-md border p-2 min-h-24 flex items-center justify-center bg-muted/20">
                        {selectedAudioAsset?.audioUrl ? (
                          <audio controls src={selectedAudioAsset.audioUrl} className="w-full" />
                        ) : (
                          <span className="text-xs text-muted-foreground">暂无配音音轨</span>
                        )}
                      </div>
                      {selectedShot.audioAssets.length > 1 ? (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {selectedShot.audioAssets.map((asset) => (
                            <Button
                              key={asset.id}
                              size="sm"
                              variant={asset.isActive ? "default" : "outline"}
                              className="h-6 px-2 text-[10px]"
                              disabled={busy !== null}
                              onClick={() => run(`activate-audio-${asset.id}`, async () => activateAsset(selectedShot.id, "audio", asset.id))}
                            >
                              {asset.isActive ? `当前 v${asset.version}` : `设为 v${asset.version}`}
                            </Button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="h-[calc(100vh-230px)] overflow-hidden card-enhanced">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">批量生产与任务控制台</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 overflow-y-auto max-h-[calc(100vh-320px)]">
            <div className="grid gap-2">
              <Button variant="outline" disabled={busy !== null || hasActiveBatchJob} onClick={() => run("batch-image", async () => createAndRunBatch("image"))}>{busy === "batch-image" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <ImageIcon className="mr-2 size-4" />}一键生图 <span className="text-[10px] opacity-70">(约-{CREDIT_COSTS.image_generate}/镜头)</span></Button>
              <Button variant="outline" disabled={busy !== null || hasActiveBatchJob} onClick={() => run("batch-video", async () => createAndRunBatch("video"))}>{busy === "batch-video" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Video className="mr-2 size-4" />}一键图生视频 <span className="text-[10px] opacity-70">(约-{CREDIT_COSTS.video_generate}/镜头)</span></Button>
              <Button variant="outline" disabled={busy !== null || hasActiveBatchJob} onClick={() => run("dub", async () => {
                const res = await fetch(`/api/projects/${project.id}/dub`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ episodeNo }),
                });
                if (!res.ok) {
                  const data = await res.json().catch(() => ({}));
                  throw new Error(data.error || "自动配音失败");
                }
              })}>{busy === "dub" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <FileText className="mr-2 size-4" />}一键自动配音</Button>
              <Button disabled={busy !== null || hasActiveBatchJob} onClick={() => run("render", async () => {
                const res = await fetch(`/api/projects/${project.id}/render`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ episodeNo }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) { const e: {error?:string;hint?:string} = data; throw Object.assign(new Error(e.error||"合成失败"), { hint: e.hint }); }
              })}>{busy === "render" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <CheckCircle2 className="mr-2 size-4" />}合成整集 <span className="text-[10px] opacity-70">(-{CREDIT_COSTS.render}额度)</span></Button>
              <Button variant="outline" disabled={busy !== null || hasActiveBatchJob} onClick={() => run("mix", async () => {
                const res = await fetch(`/api/projects/${project.id}/mix`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ episodeNo }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) { const e: {error?:string;hint?:string} = data; throw Object.assign(new Error(e.error||"音轨混合失败"), { hint: e.hint }); }
              })}>{busy === "mix" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <CheckCircle2 className="mr-2 size-4" />}合成配音版 <span className="text-[10px] opacity-70">(-{CREDIT_COSTS.audio_mix}额度)</span></Button>
              <Button variant="outline" disabled={busy !== null} onClick={() => run("export-xlsx", async () => exportProject("xlsx"))}>{busy === "export-xlsx" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <FileText className="mr-2 size-4" />}导出分镜表 XLSX</Button>
              <Button variant="outline" disabled={busy !== null} onClick={() => run("export-pdf", async () => exportProject("pdf"))}>{busy === "export-pdf" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <FileText className="mr-2 size-4" />}导出项目包 PDF</Button>
              <Button variant="outline" disabled={busy !== null} onClick={() => run("export-csv", async () => exportProject("csv"))}>{busy === "export-csv" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <FileText className="mr-2 size-4" />}导出 CSV</Button>
              <Button variant="outline" disabled={busy !== null} onClick={() => run("export-zip", async () => exportProject("zip"))}>{busy === "export-zip" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <FileText className="mr-2 size-4" />}导出 ZIP</Button>
              {hasActiveBatchJob ? (
                <div className="text-[11px] text-muted-foreground rounded border border-dashed px-2 py-1">
                  批任务运行中，已锁定批处理与合成功能，避免重复提交。
                </div>
              ) : null}
            </div>

            <Separator />

            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">导出任务</div>
              {exportJobs.length === 0 ? <div className="text-xs text-muted-foreground">暂无导出任务</div> : exportJobs.map((j) => (
                <div key={j.id} className="rounded border p-2 text-xs space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">导出 {String(j.format).toUpperCase()}</span>
                    <Badge variant={exportStatusTone(j.status)} className="text-[10px]">{exportStatusLabel(j.status)}</Badge>
                  </div>
                  <div className="text-muted-foreground">{new Date(j.createdAt).toLocaleString("zh-CN")}</div>
                  {j.errorMessage ? <div className="text-red-400 line-clamp-2">{j.errorMessage}</div> : null}
                  <div className="flex gap-1 pt-1">
                    {j.fileUrl ? (
                      <a href={`/api/exports/${j.id}/download`} target="_blank" rel="noreferrer" className="inline-flex items-center rounded border px-2 h-6 text-[10px] hover:bg-muted/30">
                        下载
                      </a>
                    ) : null}
                    {j.status === "failed" ? (
                      <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" disabled={busy !== null} onClick={() => run(`retry-export-${j.id}`, async () => {
                        const res = await fetch(`/api/exports/${j.id}/retry`, { method: "POST" });
                        if (!res.ok) {
                          const data = await res.json().catch(() => ({}));
                          throw new Error(data.error || "导出重试失败");
                        }
                      })}>重试</Button>
                    ) : null}
                    {j.status === "queued" ? (
                      <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" disabled={busy !== null} onClick={() => run(`cancel-export-${j.id}`, async () => {
                        const res = await fetch(`/api/exports/${j.id}/cancel`, { method: "POST" });
                        if (!res.ok) {
                          const data = await res.json().catch(() => ({}));
                          throw new Error(data.error || "导出取消失败");
                        }
                      })}>取消</Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>

            <Separator />

            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">当前分集任务流</div>
              {currentEpisodeJobs.length === 0 ? <div className="text-xs text-muted-foreground">当前分集暂无任务</div> : currentEpisodeJobs.map((job) => (
                <div key={job.id} className="timeline-job rounded-2xl border p-3 text-xs space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium">{jobTypeLabel(job.jobType)}</div>
                      <div className="mt-1 text-muted-foreground">{new Date(job.createdAt).toLocaleString("zh-CN")}</div>
                    </div>
                    <Badge variant={statusTone(job.status)} className="text-[10px]">{statusLabel(job.status)}</Badge>
                  </div>
                  {(() => {
                    const payload = (job.outputPayload || {}) as {
                      progressPercent?: number;
                      processed?: number;
                      total?: number;
                      failed?: Array<{ shotId: string; shotNo: number; error: string }>;
                    };
                    const hasProgress = typeof payload.progressPercent === "number";
                    const failedList = Array.isArray(payload.failed) ? payload.failed : [];
                    const filteredFailedList = failedList.filter((f) => {
                      if (jobErrorFilter === "all") return true;
                      return classifyJobError(f.error || "") === jobErrorFilter;
                    });
                    return hasProgress ? (
                      <div className="space-y-1">
                        <div className="timeline-progress">
                          <div className="timeline-progress-bar" style={{ width: `${payload.progressPercent}%` }} />
                        </div>
                        <div className="text-[10px] text-muted-foreground">进度 {payload.progressPercent}% ({payload.processed || 0}/{payload.total || 0})</div>
                        {failedList.length > 0 ? (
                          <div className="space-y-1">
                            <div className="flex flex-wrap gap-1">
                              {(["all", "quota", "network", "model", "asset", "other"] as JobErrorCategory[]).map((c) => (
                                <Button
                                  key={`${job.id}-${c}`}
                                  size="sm"
                                  variant={jobErrorFilter === c ? "default" : "outline"}
                                  className="h-6 px-2 text-[10px]"
                                  onClick={() => setJobErrorFilter(c)}
                                >
                                  {categoryLabel(c)}
                                </Button>
                              ))}
                            </div>
                            <div className="flex flex-wrap gap-1">
                            {filteredFailedList.slice(0, 3).map((f) => (
                              <div key={`${job.id}-${f.shotId}`} className="flex gap-1">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 px-2 text-[10px]"
                                  onClick={() => setSelectedShotId(f.shotId)}
                                >
                                  镜头{f.shotNo}·{categoryLabel(classifyJobError(f.error || ""))}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 px-2 text-[10px]"
                                  disabled={busy !== null}
                                  onClick={() => run(`retry-failed-shot-${f.shotId}`, async () => {
                                    const mode = job.jobType === "batch_video_generate" ? "video" : "image";
                                    const res = await fetch(`/api/shots/${f.shotId}/retry`, {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ mode }),
                                    });
                                    if (!res.ok) {
                                      const data = await res.json().catch(() => ({}));
                                      throw new Error(data.error || "失败镜头重试失败");
                                    }
                                  })}
                                >
                                  重试镜头
                                </Button>
                              </div>
                            ))}
                            </div>
                          </div>
                        ) : null}
                        {failedList.length > 0 && filteredFailedList.length === 0 ? (
                          <div className="text-[10px] text-muted-foreground">当前分类下无失败镜头。</div>
                        ) : null}
                      </div>
                    ) : null;
                  })()}
                  {job.errorMessage ? <div className="rounded-xl border border-red-400/15 bg-red-400/8 px-2 py-1 text-red-300 line-clamp-2">{job.errorMessage}</div> : null}
                  <div className="flex gap-1 pt-1">
                    <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" disabled={busy !== null || isJobRunning(job.status)} onClick={() => run(`retry-${job.id}`, async () => {
                      const res = await fetch(`/api/jobs/${job.id}/retry`, { method: "POST" });
                      const data = await res.json().catch(() => ({}));
                      if (!res.ok) {
                        throw new Error(data.error || "任务重试失败");
                      }
                      if (data.accepted === false && data.reason === "already_running") {
                        throw new Error("任务已在运行中");
                      }
                    })}><RotateCcw className="mr-1 size-3" />重试</Button>
                    <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" disabled={busy !== null || !isJobRunning(job.status)} onClick={() => run(`cancel-${job.id}`, async () => {
                      const res = await fetch(`/api/jobs/${job.id}/cancel`, { method: "POST" });
                      if (!res.ok) {
                        const data = await res.json().catch(() => ({}));
                        throw new Error(data.error || "任务取消失败");
                      }
                    })}><XCircle className="mr-1 size-3" />取消</Button>
                  </div>
                </div>
              ))}
            </div>

            <Separator />

            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">成片输出</div>
              {projectState.renderOutputs.length === 0 ? (
                <div className="text-xs text-muted-foreground">暂无成片输出</div>
              ) : (
                projectState.renderOutputs.map((o) => (
                  <a key={o.id} className="block rounded-md border p-3 text-xs hover:bg-muted/40" href={o.fileUrl} target="_blank" rel="noreferrer">
                    <div className="font-medium">
                      第{o.episodeNo}集成片
                      {readRenderMode(o.metadata) === "ffmpeg_concat_audio" ? "（配音版）" : "（无配音版）"}
                    </div>
                    <div className="text-muted-foreground mt-1">{new Date(o.createdAt).toLocaleString("zh-CN")}</div>
                  </a>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div> : null}
    </div>
  );
}
