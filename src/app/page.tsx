import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getSession } from "@/lib/auth";
import {
  Sparkles,
  FileText,
  Users,
  Video,
  Clock,
  Zap,
  ArrowRight,
  Play,
  Star,
  CheckCircle,
  ChevronRight,
} from "lucide-react";

export default async function LandingPage() {
  const session = await getSession();

  const features = [
    {
      icon: <Sparkles className="size-6" />,
      title: "一键直出整集",
      description: "从全剧大纲、单集剧本、分镜到镜头视频，工作台可按步骤自动推进到配音成片",
      gradient: "from-amber-500 to-red-500",
    },
    {
      icon: <FileText className="size-6" />,
      title: "结构化分镜链路",
      description: "先生成结构化分镜词，再批量生图、批量图生视频，保证链路清晰可控",
      gradient: "from-blue-500 to-cyan-500",
    },
    {
      icon: <Users className="size-6" />,
      title: "角色一致性控制",
      description: "角色卡支持外貌锁定词、服装锁定词、参考图和音色，统一后续画面与配音",
      gradient: "from-pink-500 to-purple-500",
    },
    {
      icon: <Video className="size-6" />,
      title: "成片与项目包导出",
      description: "支持导出配音版成片，以及 PDF、XLSX、CSV、ZIP 等交付文件",
      gradient: "from-cyan-500 to-green-500",
    },
    {
      icon: <Clock className="size-6" />,
      title: "自动任务推进",
      description: "工作台会识别当前所处阶段，给出下一步动作，并能自动串行推进",
      gradient: "from-yellow-500 to-orange-500",
    },
    {
      icon: <Zap className="size-6" />,
      title: "失败可定位可重试",
      description: "支持镜头级检查、版本切换、失败镜头重试和批任务状态追踪",
      gradient: "from-orange-500 to-red-500",
    },
  ];

  const steps = [
    {
      step: "01",
      title: "输入项目信息",
      description: "创建项目，填写标题、梗概和目标集数",
    },
    {
      step: "02",
      title: "AI 规划全剧",
      description: "生成全剧圣经、分集大纲和当前分集剧本",
    },
    {
      step: "03",
      title: "自动生成镜头",
      description: "按分镜词、生图、图生视频、自动配音的顺序推进",
    },
    {
      step: "04",
      title: "输出成片与交付包",
      description: "导出配音成片，并按需下载分镜表、项目包与素材文件",
    },
  ];

  const demos = [
    {
      title: "替身新娘的反击",
      genre: "霸总甜宠",
      description: "女主被迫替嫁给冷面总裁，后期身份反转",
      episodes: 12,
      rating: 4.8,
    },
    {
      title: "第七层的证据",
      genre: "都市悬疑",
      description: "实习律师调查坠楼案，揭开公司高层利益链",
      episodes: 10,
      rating: 4.9,
    },
    {
      title: "离婚协议第九条",
      genre: "情感反转",
      description: "女主签下离婚协议后意外失忆，前夫追妻",
      episodes: 8,
      rating: 4.7,
    },
  ];

  const stats = [
    { value: "7", label: "自动生产阶段" },
    { value: "4", label: "核心导出格式" },
    { value: "镜头级", label: "失败可重试" },
    { value: "配音成片", label: "当前主目标" },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-background bg-noise">
      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        {/* 背景效果 */}
        <div className="absolute inset-0 bg-grid opacity-30" />
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-float" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-float delay-300" />
        
        <div className="container relative z-10 text-center space-y-8">
          <Badge variant="outline" className="gap-2 px-4 py-2 border-primary/30 bg-primary/5">
            <Zap className="text-primary size-3.5" />
            <span>AI 驱动的短剧自动化制片工作台</span>
          </Badge>
          
          <h1 className="text-balance text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight">
            <span className="text-gradient">一步步</span>
            <br />
            <span className="text-foreground">生成 AI 短剧成片</span>
          </h1>
          
          <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
            从全剧大纲、单集剧本、分镜、生图、图生视频到自动配音
            <br className="hidden md:block" />
            帮短剧团队把生产链路收进一个可追踪、可重试、可导出的工作台
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button size="lg" className="btn-primary text-lg px-8 py-6 rounded-xl gap-2" asChild>
              <Link href={session ? "/dashboard" : "/login"}>
                {session ? "进入工作台" : "开始一键直出"}
                <ArrowRight className="size-5" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="text-lg px-8 py-6 rounded-xl border-primary/30 hover:bg-primary/10 gap-2" asChild>
              <Link href="#demo">
                <Play className="size-5" />
                观看演示
              </Link>
            </Button>
          </div>
          
          <div className="flex flex-wrap items-center justify-center gap-6 pt-8">
            {stats.map((stat, index) => (
              <div key={index} className="min-w-24 text-center">
                <div className="text-2xl md:text-3xl font-bold text-foreground">{stat.value}</div>
                <div className="text-sm text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
        
        {/* 向下滚动提示 */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
          <ChevronRight className="size-6 text-muted-foreground rotate-90" />
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 relative">
        <div className="container">
          <div className="text-center space-y-4 mb-16">
            <Badge variant="outline" className="gap-2 px-4 py-2 border-primary/30 bg-primary/5">
              <Sparkles className="text-primary size-3.5" />
              <span>核心功能</span>
            </Badge>
            <h2 className="text-balance text-4xl md:text-5xl font-bold">
              为短剧团队
              <span className="text-gradient"> 量身打造</span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              从剧本到成片，一站式串起短剧自动化生产的关键步骤
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <Card key={index} className="card-enhanced group">
                <CardHeader>
                  <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center text-white mb-4 group-hover:scale-110 transition-transform`}>
                    {feature.icon}
                  </div>
                  <CardTitle className="text-xl">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground leading-relaxed">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-24 relative bg-secondary/30">
        <div className="container">
          <div className="text-center space-y-4 mb-16">
            <Badge variant="outline" className="gap-2 px-4 py-2 border-primary/30 bg-primary/5">
              <Clock className="text-primary size-3.5" />
              <span>使用流程</span>
            </Badge>
            <h2 className="text-balance text-4xl md:text-5xl font-bold">
              简单
              <span className="text-gradient"> 四步</span>
              开始创作
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              用户只需要顺着工作台往下走，系统负责把链路自动推进
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {steps.map((step, index) => (
              <div key={index} className="relative">
                <div className="card-enhanced p-6 rounded-2xl text-center space-y-4">
                  <div className="text-5xl font-bold text-gradient">{step.step}</div>
                  <h3 className="text-xl font-semibold">{step.title}</h3>
                  <p className="text-muted-foreground">{step.description}</p>
                </div>
                {index < steps.length - 1 && (
                  <div className="hidden lg:block absolute top-1/2 -right-4 transform -translate-y-1/2">
                    <ChevronRight className="size-6 text-primary/50" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Demo Projects */}
      <section id="demo" className="py-24 relative">
        <div className="container">
          <div className="text-center space-y-4 mb-16">
            <Badge variant="outline" className="gap-2 px-4 py-2 border-primary/30 bg-primary/5">
              <Star className="text-primary size-3.5" />
              <span>样板项目</span>
            </Badge>
            <h2 className="text-balance text-4xl md:text-5xl font-bold">
              看看 AI
              <span className="text-gradient"> 生成效果</span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              真实短剧题材样板，用来验证全剧规划、镜头生成与成片输出链路
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {demos.map((demo, index) => (
              <Card key={index} className="card-enhanced overflow-hidden group">
                <div className="h-48 bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center relative">
                  <div className="text-6xl opacity-20 group-hover:scale-110 transition-transform">🎬</div>
                  <Badge className="absolute top-4 right-4 bg-primary/90">{demo.genre}</Badge>
                </div>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xl">{demo.title}</CardTitle>
                    <div className="flex items-center gap-1 text-yellow-500">
                      <Star className="size-3.5 fill-current" />
                      <span className="text-sm font-medium">{demo.rating}</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">{demo.description}</p>
                  <div className="flex items-center justify-between">
                    <Badge variant="outline">{demo.episodes} 集</Badge>
                    <Button variant="ghost" size="sm" className="gap-1.5 text-primary hover:text-primary/80">
                      查看详情
                      <ArrowRight className="size-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          
          <div className="text-center mt-12">
            <Button variant="outline" size="lg" className="gap-2 border-primary/30 hover:bg-primary/10" asChild>
              <Link href={session ? "/dashboard" : "/login"}>
                查看更多示例
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-secondary/20" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/10 rounded-full blur-3xl" />
        
        <div className="container relative z-10 text-center space-y-8">
          <h2 className="text-balance text-4xl md:text-5xl lg:text-6xl font-bold">
            开始你的
            <br />
            <span className="text-gradient">AI 短剧直出流程</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            登录后创建项目，即可从工作台按步骤生成剧本、镜头视频和配音成片
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" className="btn-primary text-lg px-8 py-6 rounded-xl gap-2" asChild>
              <Link href={session ? "/dashboard" : "/login"}>
                {session ? "进入工作台" : "进入工作台"}
                <ArrowRight className="size-5" />
              </Link>
            </Button>
          </div>
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <CheckCircle className="size-4 text-green-500" />
            <span>创建项目即进工作台</span>
            <span className="mx-2">•</span>
            <CheckCircle className="size-4 text-green-500" />
            <span>支持镜头级重试</span>
            <span className="mx-2">•</span>
            <CheckCircle className="size-4 text-green-500" />
            <span>可导出配音成片</span>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-border/50">
        <div className="container">
          <div className="flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-blue-500 flex items-center justify-center">
                <Sparkles className="size-4 text-white" />
              </div>
              <span className="font-bold text-lg">AI 短剧制片台</span>
            </div>
            <nav className="flex items-center gap-6 text-sm text-muted-foreground">
              <Link href="#features" className="hover:text-foreground transition-colors">功能</Link>
              <Link href="#demo" className="hover:text-foreground transition-colors">示例</Link>
              <Link href="/login" className="hover:text-foreground transition-colors">登录</Link>
            </nav>
            <p className="text-sm text-muted-foreground">
              © 2026 AI 短剧制片台. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
