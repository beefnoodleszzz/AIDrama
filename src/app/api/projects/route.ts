import { z } from "zod";
import { createProject } from "@/server/workflow/service";
import { fail, ok } from "@/server/workflow/http";

const schema = z.object({
  title: z.string().min(1),
  synopsis: z.string().optional(),
  episodeTarget: z.number().int().min(1).max(100).optional(),
});

export async function POST(req: Request) {
  try {
    const body = schema.parse(await req.json());
    const project = await createProject(body);
    return ok({ project }, 201);
  } catch (error) {
    return fail(error);
  }
}
