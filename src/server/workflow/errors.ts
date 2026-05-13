export type WorkflowErrorCode =
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "INVALID_STATE"
  | "VALIDATION_ERROR"
  | "TEXT_TO_VIDEO_FORBIDDEN"
  | "CREDIT_NOT_ENOUGH"
  | "AI_PROVIDER_FAILED"
  | "AI_OUTPUT_INVALID"
  | "ASSET_UPLOAD_FAILED"
  | "RENDER_FAILED"
  | "RATE_LIMITED"
  | "JOB_CANCELLED"
  | "JOB_TIMEOUT"
  | "CONTENT_RISK"
  | "INTERNAL_ERROR";

export class WorkflowError extends Error {
  constructor(
    message: string,
    public code: WorkflowErrorCode
  ) {
    super(message);
    this.name = "WorkflowError";
  }
}
