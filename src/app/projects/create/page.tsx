"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles, Clapperboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { storyProjectSchema, type StoryProjectFormValues } from "@/lib/schemas/story-project";
import { useToast } from "@/hooks/use-toast";

export default function CreateProjectPage() {
  const router = useRouter();
  const { toast } = useToast();

  const form = useForm<StoryProjectFormValues>({
    resolver: zodResolver(storyProjectSchema),
    defaultValues: {
      title: "",
      synopsis: "",
      episodeTarget: 1,
    },
  });

  const loading = form.formState.isSubmitting;

  async function onSubmit(values: StoryProjectFormValues) {
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const data = await res.json();

    if (!res.ok) {
      toast({ title: "创建失败", description: data.error || "请稍后重试", variant: "destructive" });
      return;
    }

    toast({ title: "创建成功", description: "已进入项目工作台" });
    router.push(`/workspace/${data.project.id}`);
  }

  return (
    <div className="container max-w-4xl py-10">
      <div className="mb-8 space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">创建项目</h1>
        <p className="text-muted-foreground">先建立项目容器，再进入工作台导入剧本。镜头数、生产节奏和下一步动作都由系统在工作台里自动判断。</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
        <Card className="card-enhanced">
          <CardHeader>
            <CardTitle>项目信息</CardTitle>
            <CardDescription>这里只保留必要信息，避免在入口页要求用户做过多生产决策。</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>项目标题</FormLabel>
                      <FormControl>
                        <Input className="input-enhanced" placeholder="例如：夜雨追凶" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="synopsis"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>剧情梗概</FormLabel>
                      <FormControl>
                        <Textarea
                          className="input-enhanced min-h-44"
                          placeholder="输入故事背景、人物关系、冲突主线..."
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="episodeTarget"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>目标集数</FormLabel>
                      <FormControl>
                        <Input
                          className="input-enhanced"
                          type="number"
                          min={1}
                          max={100}
                          value={field.value}
                          onChange={(e) => field.onChange(Number(e.target.value || 1))}
                        />
                      </FormControl>
                      <div className="text-xs text-muted-foreground">用于规划项目规模，不控制单集分镜数量。</div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex items-center gap-3">
                  <Button type="submit" className="btn-primary" disabled={loading}>
                    {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Sparkles className="mr-2 size-4" />}
                    创建并进入工作台
                  </Button>
                  <Button type="button" variant="outline" onClick={() => router.push("/dashboard")}>
                    返回项目列表
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Clapperboard className="size-5" />生产流程</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>1. 导入/生成剧本</p>
            <p>2. 生成结构化分镜词</p>
            <p>3. 生图模型生成分镜图</p>
            <p>4. 图生视频模型生成镜头片段</p>
            <p>5. 镜头合成整集</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
