"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CreditCard, Zap, Crown } from "lucide-react";

interface CreditBalanceProps {
  userId: string;
}

export function CreditBalance({ userId }: CreditBalanceProps) {
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchBalance = useCallback(async () => {
    try {
      const res = await fetch(`/api/credits?userId=${encodeURIComponent(userId)}`);
      const data = await res.json();
      setBalance(data.balance);
    } catch (error) {
      console.error("Failed to fetch balance:", error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchBalance();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchBalance]);

  if (loading) {
    return <Skeleton className="h-6 w-24" />;
  }

  return (
    <Badge variant="secondary" className="gap-1.5">
      <Zap className="text-primary size-3.5" />
      额度: {balance ?? 0}
    </Badge>
  );
}

interface PaywallCardProps {
  feature: string;
  cost: number;
  currentBalance: number;
  onPurchase?: () => void;
}

export function PaywallCard({ feature, cost, currentBalance, onPurchase }: PaywallCardProps) {
  const hasEnoughCredits = currentBalance >= cost;

  if (hasEnoughCredits) {
    return null;
  }

  return (
    <Card className="border-amber-200 bg-amber-50">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Crown className="text-amber-500 size-5" />
          <CardTitle className="text-sm">额度不足</CardTitle>
        </div>
        <CardDescription>
          {feature}需要 {cost} 额度，当前余额 {currentBalance}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2">
          <Button size="sm" className="gap-1.5" onClick={onPurchase}>
            <CreditCard />
            购买额度
          </Button>
          <Button size="sm" variant="outline">
            查看套餐
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// Hook to check credits before action
export function useCreditCheck() {
  const [balance, setBalance] = useState<number | null>(null);

  const fetchBalance = useCallback(async () => {
    try {
      const res = await fetch("/api/credits");
      const data = await res.json();
      setBalance(data.balance);
    } catch (error) {
      console.error("Failed to fetch balance:", error);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchBalance();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchBalance]);

  const checkCredits = (required: number): boolean => {
    if (balance === null) return false;
    return balance >= required;
  };

  return { balance, checkCredits, refetchBalance: fetchBalance };
}
