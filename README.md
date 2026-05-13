# AI 短剧制片台 App

这是当前项目的真实应用主体。与根目录部分早期文档相比，这个 `app` 已经不是单纯的“策划包生成器”，而是一个面向短剧团队的 AI 自动化制片工作台。

## 当前能力

当前主链路围绕“在工作台中逐步生成 AI 短剧成片”展开：

- 创建项目
- 生成全剧大纲与分集规划
- 生成当前分集剧本
- 生成结构化分镜
- 批量生图
- 批量图生视频
- 自动配音
- 合成整集成片
- 导出 PDF / XLSX / CSV / ZIP

工作台已支持：

- `下一步` 引导
- `一键直出 AI 短剧`
- 镜头级修订与重试
- 角色锁定词 / 参考图 / 音色管理
- 批任务与导出任务追踪

## 技术栈

- Next.js 16 App Router
- React 19
- Prisma 7 + PostgreSQL Driver Adapter
- BullMQ + Redis
- FFmpeg 本地合成
- Aliyun OSS 文件存储

## 启动

先准备环境变量：

```bash
cp .env.example .env
```

至少需要确认这些配置可用：

- `DATABASE_URL`
- `REDIS_URL`
- `NEXTAUTH_SECRET`
- 一组 AI Provider 凭证
- OSS 配置
- `FFMPEG_PATH`（如果系统默认路径不可用）

然后启动开发环境：

```bash
pnpm dev
```

如需执行批任务 Worker：

```bash
pnpm worker
```

默认开发地址：

- [http://localhost:3000](http://localhost:3000)

## 当前产品判断原则

如果你在继续开发这个项目，优先级判断应以这句话为准：

“这项修改是否能让用户更顺地在工作台中直接生成 AI 短剧成片？”

能提升这条主链的内容优先级最高。
