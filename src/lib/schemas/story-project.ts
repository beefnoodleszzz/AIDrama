import { z } from "zod";

export const storyProjectSchema = z.object({
  title: z.string().trim().min(2, "项目标题至少 2 个字").max(60, "项目标题最多 60 个字"),
  synopsis: z.string().trim().max(2000, "剧情梗概最多 2000 字").optional(),
  episodeTarget: z.number().int().min(1, "至少 1 集").max(100, "最多 100 集"),
});

export type StoryProjectFormValues = z.infer<typeof storyProjectSchema>;
