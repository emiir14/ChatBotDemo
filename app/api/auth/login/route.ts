import { NextResponse } from "next/server";
import { createSessionToken, clearFailedLogins, getCookieName, registerFailedLogin } from "@/lib/auth";
import { getEnv } from "@/lib/env";

/** POST /api/auth/login { password } → cookie de sesión. */
export async function POST(req: Request): Promise<NextResponse> {
  let password: unknown;
  try {
    password = (await req.json())?.password;
  } catch {
    return NextResponse.json({ error: "Pedido inválido" }, { status: 400 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (registerFailedLogin(ip)) {
    return NextResponse.json(
      { error: "Demasiados intentos. Probá de nuevo en unos minutos." },
      { status: 429 },
    );
  }

  let expected: string | undefined;
  try {
    expected = getEnv().DASHBOARD_PASSWORD;
  } catch {
    expected = undefined;
  }
  if (!expected || typeof password !== "string" || password !== expected) {
    return NextResponse.json({ error: "Contraseña incorrecta" }, { status: 401 });
  }

  clearFailedLogins(ip);
  const token = await createSessionToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(getCookieName(), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });
  return res;
}
