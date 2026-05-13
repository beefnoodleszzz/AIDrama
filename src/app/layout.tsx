import type { Metadata } from "next";
import { Navbar } from "@/components/layout/navbar";
import { getSession } from "@/lib/auth";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: "AI 短剧制片台",
  description: "10 分钟生成一份可交付的短剧前期策划包",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSession();

  return (
    <html
      lang="zh-CN"
      className="h-full antialiased"
    >
      <body suppressHydrationWarning className="min-h-full flex flex-col">
        <Navbar user={session} />
        <main className="flex-1">{children}</main>
        <Toaster />
      </body>
    </html>
  );
}
