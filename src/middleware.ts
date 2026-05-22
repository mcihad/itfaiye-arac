import { NextResponse, type NextRequest } from "next/server";
import { verifyToken } from "@/lib/auth";

// Paths that require Admin or Editor role
const ADMIN_PATHS = ["/yonetim"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public routes that don't need auth
  const publicPaths = ["/login", "/api/seed", "/api/setup", "/api/auth/login", "/api/auth/logout", "/api/db/", "/api/upload"];
  const isPublicPath = publicPaths.some((p) => pathname.startsWith(p));

  // JWT token kontrolü
  const token = request.cookies.get("itfaiye_token")?.value;
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;

  const session = verifyToken(token || bearerToken || "");

  // Eğer kullanıcı giriş yapmışsa ve login sayfasına girmeye çalışıyorsa yonetim'e yönlendir
  if (pathname === "/login" && session) {
    return NextResponse.redirect(new URL("/yonetim", request.url));
  }

  // Static files, public routes
  if (isPublicPath) {
    return NextResponse.next({ request });
  }

  // Giriş yapılmamışsa login sayfasına yönlendir
  if (!session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // RBAC: Admin-only paths
  const isAdminPath = ADMIN_PATHS.some((p) => pathname.startsWith(p));
  if (isAdminPath) {
    if (session.rol !== "Admin" && session.rol !== "Editor" && session.rol !== "Shift_Leader") {
      const dashUrl = new URL("/", request.url);
      dashUrl.searchParams.set("unauthorized", "1");
      return NextResponse.redirect(dashUrl);
    }
  }

  return NextResponse.next({ request });
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|login|icons|models|uploads|manifest\\.json|sw\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"
  ],
};
