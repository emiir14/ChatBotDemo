import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCookieName, verifySessionToken } from "@/lib/auth";

/**
 * Protege /dashboard* y /api/dashboard*. Sin sesión válida: la página
 * redirige a /login y la API responde 401.
 */
export async function middleware(req: NextRequest): Promise<NextResponse> {
  const token = req.cookies.get(getCookieName())?.value;
  const valid = await verifySessionToken(token);
  if (valid) return NextResponse.next();

  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/dashboard/:path*"],
};
