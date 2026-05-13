"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Zap, 
  LogOut, 
  User, 
  Sparkles,
  Menu,
  X,
  CreditCard,
  Settings,
  Bell,
} from "lucide-react";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface NavbarProps {
  user?: {
    id: string;
    email: string | null;
    nickname: string | null;
    plan: string;
    creditBalance: number;
  } | null;
  loading?: boolean;
}

export function Navbar({ user, loading }: NavbarProps) {
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-50 glass border-b border-border/50">
      <div className="container flex h-16 items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-blue-500 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Sparkles className="text-white size-4" />
            </div>
            <span className="font-bold text-lg hidden sm:block">AI 短剧制片台</span>
          </Link>
          
          {user && (
            <nav className="hidden md:flex items-center gap-1">
              <Button variant="ghost" size="sm" asChild>
                <Link href="/dashboard">项目列表</Link>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/projects/create">新建项目</Link>
              </Button>
            </nav>
          )}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3">
          {loading ? (
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-24 rounded-lg" />
              <Skeleton className="h-8 w-8 rounded-lg" />
            </div>
          ) : user ? (
            <>
              {/* Credits */}
              <Badge variant="outline" className="gap-1.5 px-3 py-1.5 border-primary/30 bg-primary/5 hidden sm:flex">
                <Zap className="text-primary size-3.5" />
                <span className="font-medium">{user.creditBalance}</span>
              </Badge>
              
              {/* Notifications */}
              <Button variant="ghost" size="icon" className="relative" aria-label="查看通知">
                <Bell />
                <span className="absolute top-1 right-1 w-2 h-2 bg-primary rounded-full" />
              </Button>
              
              {/* User menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="rounded-full" aria-label="打开用户菜单">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-blue-500 flex items-center justify-center">
                      <User className="text-white size-3.5" />
                    </div>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">{user.nickname || user.email}</p>
                      <p className="text-xs leading-none text-muted-foreground">
                        {user.email}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="gap-2">
                    <CreditCard />
                    <span>额度: {user.creditBalance}</span>
                    <Badge variant="secondary" className="ml-auto">
                      {user.plan}
                    </Badge>
                  </DropdownMenuItem>
                  <DropdownMenuItem className="gap-2" onClick={() => router.push("/dashboard")}>
                    <Settings />
                    <span>设置</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="gap-2 text-destructive focus:text-destructive" onClick={handleLogout}>
                    <LogOut />
                    <span>退出登录</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <Button size="sm" className="btn-primary gap-1.5" asChild>
              <Link href="/login">
                <User />
                登录
              </Link>
            </Button>
          )}
          
          {/* Mobile menu button */}
          {user && (
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? "关闭菜单" : "打开菜单"}
            >
              {mobileMenuOpen ? <X /> : <Menu />}
            </Button>
          )}
        </div>
      </div>
      
      {/* Mobile menu */}
      {mobileMenuOpen && user && (
        <div className="md:hidden border-t border-border/50 bg-background/95 backdrop-blur-sm">
          <nav className="container py-4 flex flex-col gap-2">
            <Button variant="ghost" className="justify-start gap-2" asChild>
              <Link href="/dashboard" onClick={() => setMobileMenuOpen(false)}>
                项目列表
              </Link>
            </Button>
            <Button variant="ghost" className="justify-start gap-2" asChild>
              <Link href="/projects/create" onClick={() => setMobileMenuOpen(false)}>
                新建项目
              </Link>
            </Button>
            <div className="flex items-center gap-2 px-4 py-2">
              <Zap className="text-primary size-3.5" />
              <span className="text-sm">额度: {user.creditBalance}</span>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
