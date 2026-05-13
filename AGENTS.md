<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# AI 短剧制片台 MVP

## 技术栈
- **Runtime**: Node.js 22+
- **Package Manager**: pnpm (NOT npm)
- **Framework**: Next.js 16 with Turbopack
- **Database**: PostgreSQL + Prisma ORM
- **UI**: shadcn/ui + Tailwind CSS v4
- **Auth**: JWT (jose)

## 常用命令

```bash
# 安装依赖
pnpm install

# 开发服务器
pnpm dev

# 构建
pnpm build

# 数据库操作
pnpm exec prisma db push
pnpm exec prisma generate
pnpm exec prisma studio
```

## 项目结构
```
src/
├── app/              # Next.js App Router
│   ├── (app)/        # 需要认证的页面
│   ├── api/          # API 路由
│   └── workspace/    # 创作工作台
├── components/       # React 组件
├── hooks/            # 自定义 Hooks
├── lib/              # 工具函数和类型
└── server/           # 服务端代码
    ├── actions/      # Server Actions
    ├── ai/           # AI Provider
    ├── db/           # Prisma 客户端
    └── queue/        # 任务队列
```

## 环境变量
复制 `.env.example` 到 `.env` 并填写：
- `DATABASE_URL`: PostgreSQL 连接字符串
- `SILICONFLOW_API_KEY`（Route B 默认）或 `OPENAI_API_KEY` / `DEEPSEEK_API_KEY`: AI API 密钥
- `NEXTAUTH_SECRET`: JWT 密钥
