-- CreateEnum
CREATE TYPE "WorkflowStatus" AS ENUM ('DRAFT', 'PROMPT_READY', 'IMAGE_GENERATING', 'IMAGE_READY', 'VIDEO_GENERATING', 'VIDEO_READY', 'QC_PENDING', 'QC_PASS', 'QC_FAIL', 'LOCKED_FOR_RENDER', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "nickname" TEXT,
    "avatar_url" TEXT,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "credit_balance" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "story_projects" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "synopsis" TEXT,
    "episode_target" INTEGER NOT NULL DEFAULT 1,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "story_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "character_profiles" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "appearance_lock" TEXT,
    "outfit_lock" TEXT,
    "negative_prompt" TEXT,
    "reference_image_url" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "character_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "story_episode_scripts" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "episode_no" INTEGER NOT NULL,
    "title" TEXT,
    "source_type" TEXT NOT NULL DEFAULT 'imported',
    "raw_script" TEXT NOT NULL,
    "structured_data" JSONB,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "story_episode_scripts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "story_shots" (
    "id" TEXT NOT NULL,
    "episode_script_id" TEXT NOT NULL,
    "shot_no" INTEGER NOT NULL,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'DRAFT',
    "duration_seconds" DOUBLE PRECISION NOT NULL DEFAULT 3,
    "shot_type" TEXT,
    "camera_language" TEXT,
    "continuity_hint" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "story_shots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shot_prompts" (
    "id" TEXT NOT NULL,
    "shot_id" TEXT NOT NULL,
    "prompt_text" TEXT NOT NULL,
    "prompt_json" JSONB,
    "generation_model" TEXT,
    "prompt_version" TEXT NOT NULL DEFAULT 'v1',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shot_prompts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shot_image_assets" (
    "id" TEXT NOT NULL,
    "shot_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "image_url" TEXT NOT NULL,
    "provider" TEXT,
    "model" TEXT,
    "seed" TEXT,
    "metadata" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shot_image_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shot_video_assets" (
    "id" TEXT NOT NULL,
    "shot_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "video_url" TEXT NOT NULL,
    "provider" TEXT,
    "model" TEXT,
    "metadata" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shot_video_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_jobs" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "episode_script_id" TEXT,
    "shot_id" TEXT,
    "job_type" TEXT NOT NULL,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'DRAFT',
    "input_payload" JSONB,
    "output_payload" JSONB,
    "retries" INTEGER NOT NULL DEFAULT 0,
    "error_code" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qc_reports" (
    "id" TEXT NOT NULL,
    "shot_id" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "score" DOUBLE PRECISION,
    "issues" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qc_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "render_outputs" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "episode_no" INTEGER NOT NULL,
    "file_url" TEXT NOT NULL,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'DRAFT',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "render_outputs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "story_projects_user_id_idx" ON "story_projects"("user_id");

-- CreateIndex
CREATE INDEX "character_profiles_project_id_idx" ON "character_profiles"("project_id");

-- CreateIndex
CREATE INDEX "story_episode_scripts_project_id_idx" ON "story_episode_scripts"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "story_episode_scripts_project_id_episode_no_key" ON "story_episode_scripts"("project_id", "episode_no");

-- CreateIndex
CREATE INDEX "story_shots_status_idx" ON "story_shots"("status");

-- CreateIndex
CREATE UNIQUE INDEX "story_shots_episode_script_id_shot_no_key" ON "story_shots"("episode_script_id", "shot_no");

-- CreateIndex
CREATE UNIQUE INDEX "shot_prompts_shot_id_key" ON "shot_prompts"("shot_id");

-- CreateIndex
CREATE INDEX "shot_image_assets_shot_id_is_active_idx" ON "shot_image_assets"("shot_id", "is_active");

-- CreateIndex
CREATE INDEX "shot_video_assets_shot_id_is_active_idx" ON "shot_video_assets"("shot_id", "is_active");

-- CreateIndex
CREATE INDEX "workflow_jobs_project_id_status_idx" ON "workflow_jobs"("project_id", "status");

-- CreateIndex
CREATE INDEX "workflow_jobs_shot_id_status_idx" ON "workflow_jobs"("shot_id", "status");

-- CreateIndex
CREATE INDEX "qc_reports_shot_id_created_at_idx" ON "qc_reports"("shot_id", "created_at");

-- CreateIndex
CREATE INDEX "render_outputs_project_id_episode_no_idx" ON "render_outputs"("project_id", "episode_no");

-- AddForeignKey
ALTER TABLE "story_projects" ADD CONSTRAINT "story_projects_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_profiles" ADD CONSTRAINT "character_profiles_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "story_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_episode_scripts" ADD CONSTRAINT "story_episode_scripts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "story_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_shots" ADD CONSTRAINT "story_shots_episode_script_id_fkey" FOREIGN KEY ("episode_script_id") REFERENCES "story_episode_scripts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shot_prompts" ADD CONSTRAINT "shot_prompts_shot_id_fkey" FOREIGN KEY ("shot_id") REFERENCES "story_shots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shot_image_assets" ADD CONSTRAINT "shot_image_assets_shot_id_fkey" FOREIGN KEY ("shot_id") REFERENCES "story_shots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shot_video_assets" ADD CONSTRAINT "shot_video_assets_shot_id_fkey" FOREIGN KEY ("shot_id") REFERENCES "story_shots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_jobs" ADD CONSTRAINT "workflow_jobs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "story_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qc_reports" ADD CONSTRAINT "qc_reports_shot_id_fkey" FOREIGN KEY ("shot_id") REFERENCES "story_shots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "render_outputs" ADD CONSTRAINT "render_outputs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "story_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
