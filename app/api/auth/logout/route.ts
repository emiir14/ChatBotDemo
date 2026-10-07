import { NextResponse } from "next/server";
import { getCookieName } from "@/lib/auth";

/** POST /api/auth/logout → borra la cookie. */
export async function POST(): Promise<NextResponse> {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(getCookieName(), "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
