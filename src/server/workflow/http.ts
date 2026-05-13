import { NextResponse } from "next/server";
import { WorkflowError, type WorkflowErrorCode } from "./errors";

const errorStatusMap: Record<WorkflowErrorCode, number> = {
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  INVALID_STATE: 409,
  VALIDATION_ERROR: 400,
  TEXT_TO_VIDEO_FORBIDDEN: 422,
  CREDIT_NOT_ENOUGH: 402,
  AI_PROVIDER_FAILED: 502,
  AI_OUTPUT_INVALID: 422,
  ASSET_UPLOAD_FAILED: 502,
  RENDER_FAILED: 502,
  RATE_LIMITED: 429,
  JOB_CANCELLED: 409,
  JOB_TIMEOUT: 504,
  CONTENT_RISK: 422,
  INTERNAL_ERROR: 500,
};

const errorHints: Partial<Record<WorkflowErrorCode, string>> = {
  CREDIT_NOT_ENOUGH: "请前往购买额度后继续操作",
  AI_PROVIDER_FAILED: "AI 服务暂时不可用，请稍后重试",
  AI_OUTPUT_INVALID: "AI 生成结果异常，建议缩短剧本或重试",
  ASSET_UPLOAD_FAILED: "素材上传失败，请检查网络后重试",
  RENDER_FAILED: "视频合成失败，请稍后重试",
  RATE_LIMITED: "请求过于频繁，请稍后再试",
  JOB_TIMEOUT: "任务超时，可前往任务控制台重试",
  CONTENT_RISK: "内容可能包含敏感信息，请修改后重试",
  TEXT_TO_VIDEO_FORBIDDEN: "必须先生成分镜图，才能进行图生视频",
};

export function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function fail(error: unknown) {
  if (error instanceof WorkflowError) {
    const status = errorStatusMap[error.code] ?? 500;
    const hint = errorHints[error.code];
    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
        hint: hint ?? null,
      },
      { status }
    );
  }

  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Internal error", code: "INTERNAL_ERROR" },
    { status: 500 }
  );
}
