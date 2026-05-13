import { WorkflowStatus } from "@prisma/client";

export const SHOT_FLOW: WorkflowStatus[] = [
  WorkflowStatus.DRAFT,
  WorkflowStatus.PROMPT_READY,
  WorkflowStatus.IMAGE_GENERATING,
  WorkflowStatus.IMAGE_READY,
  WorkflowStatus.VIDEO_GENERATING,
  WorkflowStatus.VIDEO_READY,
  WorkflowStatus.QC_PENDING,
  WorkflowStatus.QC_PASS,
  WorkflowStatus.QC_FAIL,
  WorkflowStatus.LOCKED_FOR_RENDER,
  WorkflowStatus.DONE,
  WorkflowStatus.FAILED,
];

export const RETRYABLE_STATUSES: WorkflowStatus[] = [
  WorkflowStatus.FAILED,
  WorkflowStatus.QC_FAIL,
];

export type RetryMode = "prompt" | "image" | "video";
