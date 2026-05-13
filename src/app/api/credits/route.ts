import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/server/db";

export async function GET() {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.id },
      include: {
        creditLedger: {
          orderBy: { createdAt: "desc" },
          take: 20,
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      balance: Number(user.creditBalance),
      ledger: user.creditLedger.map((entry) => ({
        id: entry.id,
        changeType: entry.changeType,
        amount: Number(entry.amount),
        balanceAfter: Number(entry.balanceAfter),
        reason: entry.reason,
        createdAt: entry.createdAt,
      })),
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch credits" },
      { status: 500 }
    );
  }
}
