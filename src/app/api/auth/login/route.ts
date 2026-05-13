import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { createToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json(
        { error: "邮箱不能为空" },
        { status: 400 }
      );
    }

    // Find or create user (MVP simplified auth)
    let user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      // Auto-create user for MVP
      user = await prisma.user.create({
        data: {
          email,
          nickname: email.split("@")[0],
          creditBalance: 100, // Give new users 100 credits for trial
        },
      });
    }

    const token = await createToken(user.id);

    const response = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        nickname: user.nickname,
        plan: user.plan,
        creditBalance: Number(user.creditBalance),
      },
    });

    response.cookies.set("auth_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return response;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "登录失败，请稍后重试" },
      { status: 500 }
    );
  }
}
