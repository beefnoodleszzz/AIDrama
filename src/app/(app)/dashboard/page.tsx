import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { getSession } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, FolderOpen, Film, UserRound, Clock3 } from "lucide-react";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const projects = await prisma.storyProject.findMany({
    where: { userId: session.id },
    include: {
      _count: { select: { episodes: true, characters: true, renderOutputs: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="container py-8 space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">短剧项目</h1>
          <p className="text-sm text-muted-foreground mt-1">从剧本进入工作台，按分镜、生图、图生视频、配音和合成的顺序推进。</p>
        </div>
        <Button asChild className="btn-primary">
          <Link href="/projects/create"><Plus className="mr-2 size-4" />创建项目</Link>
        </Button>
      </div>

      {projects.length === 0 ? (
        <Card className="card-enhanced">
          <CardContent className="py-14 text-center">
            <FolderOpen className="mx-auto mb-4 size-12 text-primary" />
            <h2 className="text-xl font-semibold">还没有项目</h2>
            <p className="text-sm text-muted-foreground mt-2 mb-6">创建第一个项目，开始生成分镜和视频片段。</p>
            <Button asChild className="btn-primary"><Link href="/projects/create">立即创建</Link></Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => (
            <Card key={p.id} className="card-enhanced hover-glow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <CardTitle className="text-lg leading-6">{p.title}</CardTitle>
                  <Badge variant="outline">{p.status}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground line-clamp-3">{p.synopsis || "暂无剧情梗概"}</p>
                <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                  <div className="rounded-md border p-2 text-center">
                    <Film className="mx-auto mb-1 size-3.5" />
                    {p._count.episodes} 集
                  </div>
                  <div className="rounded-md border p-2 text-center">
                    <UserRound className="mx-auto mb-1 size-3.5" />
                    {p._count.characters} 角
                  </div>
                  <div className="rounded-md border p-2 text-center">
                    <FolderOpen className="mx-auto mb-1 size-3.5" />
                    {p._count.renderOutputs} 成片
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground inline-flex items-center gap-1"><Clock3 className="size-3" />{new Date(p.updatedAt).toLocaleString("zh-CN")}</span>
                  <Button asChild variant="outline" size="sm"><Link href={`/workspace/${p.id}`}>进入工作台</Link></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
