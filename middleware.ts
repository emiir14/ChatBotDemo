import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCookieName, verifySessionToken } from "@/lib/auth";

/**
 * Protege /dashboard*, /api/dashboard* y la página /salud con la misma sesión
 * del panel (cookie firmada). Sin sesión válida: las páginas redirigen a
 * /login y las APIs responden 401.
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
  matcher: ["/dashboard/:path*", "/api/dashboard/:path*", "/salud"],
};
