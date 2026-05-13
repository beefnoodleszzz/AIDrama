import { WorkflowStatus } from "@prisma/client";
import { WorkflowError } from "./errors";

export function transitionShotStatus(current: WorkflowStatus, next: WorkflowStatus) {
  const allowed = new Map<WorkflowStatus, WorkflowStatus[]>([
    [WorkflowStatus.DRAFT, [WorkflowStatus.PROMPT_READY, WorkflowStatus.FAILED]],
    [WorkflowStatus.PROMPT_READY, [WorkflowStatus.IMAGE_GENERATING, WorkflowStatus.FAILED]],
    [WorkflowStatus.IMAGE_GENERATING, [WorkflowStatus.IMAGE_READY, WorkflowStatus.FAILED]],
    [WorkflowStatus.IMAGE_READY, [WorkflowStatus.VIDEO_GENERATING, WorkflowStatus.FAILED]],
    [WorkflowStatus.VIDEO_GENERATING, [WorkflowStatus.VIDEO_READY, WorkflowStatus.FAILED]],
    [WorkflowStatus.VIDEO_READY, [WorkflowStatus.QC_PENDING, WorkflowStatus.FAILED]],
    [WorkflowStatus.QC_PENDING, [WorkflowStatus.QC_PASS, WorkflowStatus.QC_FAIL]],
    [WorkflowStatus.QC_FAIL, [WorkflowStatus.IMAGE_GENERATING, WorkflowStatus.VIDEO_GENERATING, WorkflowStatus.FAILED]],
    [WorkflowStatus.QC_PASS, [WorkflowStatus.LOCKED_FOR_RENDER, WorkflowStatus.FAILED]],
    [WorkflowStatus.LOCKED_FOR_RENDER, [WorkflowStatus.DONE, WorkflowStatus.FAILED]],
    [WorkflowStatus.FAILED, [WorkflowStatus.PROMPT_READY, WorkflowStatus.IMAGE_GENERATING, WorkflowStatus.VIDEO_GENERATING]],
    [WorkflowStatus.DONE, []],
  ]);

  const nextStatuses = allowed.get(current) || [];
  if (!nextStatuses.includes(next)) {
    throw new WorkflowError(`非法状态流转: ${current} -> ${next}`, "INVALID_STATE");
  }
}
