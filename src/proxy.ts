import { NextResponse, type NextRequest } from "next/server";

// Paths that require Admin or Editor/Shift_Leader role
const ADMIN_PATHS = ["/yonetim"];

export interface JWTPayload {
  sicilNo: string;
  ad: string;
  soyad: string;
  rol: string;
  unvan: string;
  exp?: number;
}

function getUserRole(session: JWTPayload | null | undefined): 'MUDUR' | 'AMIR' | 'ER' {
  if (!session) return 'ER';
  const rol = session.rol || '';
  const unvan = session.unvan || '';
  
  if (unvan === 'Müdür' || rol === 'Admin' || rol?.toLowerCase() === 'admin' || unvan?.toLowerCase() === 'müdür') {
    return 'MUDUR';
  }
  if (unvan === 'Amir' || rol === 'Editor' || rol?.toLowerCase() === 'editor' || unvan?.toLowerCase() === 'amir') {
    return 'AMIR';
  }
  return 'ER';
}

// ÖNEMLİ: Anahtar MODÜL YÜKLEMEDE değil, token doğrulama anında çözümlenir.
// Aksi halde `next build` sırasında (JWT_SECRET tanımlı olmadan) derleme başarısız olur.
function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.length >= 16) {
    return secret;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "JWT_SECRET ortam değişkeni tanımlı değil veya çok kısa. Üretim ortamında en az 16 karakterlik güvenli bir anahtar zorunludur."
    );
  }
  console.warn(
    "[proxy] JWT_SECRET tanımlı değil — yalnızca geliştirme ortamı için güvensiz bir varsayılan kullanılıyor. Üretimde mutlaka ayarlayın."
  );
  return "dev-only-insecure-secret-do-not-use-in-production";
}

// Convert base64url to Uint8Array for Web Crypto API signature validation
function base64UrlToBytes(base64Url: string): Uint8Array {
  let base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Base64url-decode string
function base64UrlDecode(base64Url: string): string {
  let base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  return atob(base64);
}

// Decode UTF-8 string from Base64 to properly handle Turkish/Unicode characters
function decodePayload(payloadB64: string): JWTPayload | null {
  try {
    const decodedStr = base64UrlDecode(payloadB64);
    const jsonStr = decodeURIComponent(
      decodedStr
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(jsonStr);
  } catch {
    try {
      return JSON.parse(base64UrlDecode(payloadB64));
    } catch {
      return null;
    }
  }
}

// HMAC SHA-256 signature verification using Web Crypto API
async function verifyJWTSignature(
  headerB64: string,
  payloadB64: string,
  signatureB64: string,
  secret: string
): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const dataBytes = encoder.encode(`${headerB64}.${payloadB64}`);
    const secretBytes = encoder.encode(secret);

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      secretBytes,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const signatureBytes = base64UrlToBytes(signatureB64);

    return await crypto.subtle.verify(
      "HMAC",
      cryptoKey,
      signatureBytes as any,
      dataBytes as any
    );
  } catch (err) {
    console.error("JWT signature verification error:", err);
    return false;
  }
}

async function verifyTokenEdge(token: string | undefined): Promise<JWTPayload | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, signatureB64] = parts;

  // 1. Verify HMAC Signature
  const isValidSignature = await verifyJWTSignature(
    headerB64,
    payloadB64,
    signatureB64,
    resolveJwtSecret()
  );
  if (!isValidSignature) {
    return null;
  }

  // 2. Decode and Parse Payload
  const payload = decodePayload(payloadB64);
  if (!payload) return null;

  // 3. Check Expiry
  if (payload.exp && Date.now() >= payload.exp * 1000) {
    return null;
  }

  return payload;
}

function getRedirectUrl(targetPath: string, request: NextRequest): URL {
  const url = new URL(targetPath, request.url);
  const proto = request.headers.get("x-forwarded-proto");
  if (proto === "https") {
    url.protocol = "https:";
  }
  return url;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public routes that don't need auth
  const publicPaths = ["/login", "/api/seed", "/api/setup", "/api/auth/login", "/api/auth/logout", "/api/db/", "/api/upload", "/api/citizen-requests"];
  const isPublicPath = publicPaths.some((p) => pathname.startsWith(p));

  // JWT token kontrolü
  const token = request.cookies.get("itfaiye_token")?.value;
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;

  const effectiveToken = token || bearerToken || "";
  const session = await verifyTokenEdge(effectiveToken);

  // Eğer kullanıcı giriş yapmışsa ve login sayfasına girmeye çalışıyorsa yonetim'e yönlendir
  if (pathname === "/login" && session) {
    return NextResponse.redirect(getRedirectUrl("/yonetim", request));
  }

  // Static files, public routes
  if (isPublicPath) {
    return NextResponse.next({ request });
  }

  // Giriş yapılmamışsa veya geçerli bir rolü yoksa login sayfasına yönlendir (katı kontrol)
  if (!session || !session.rol) {
    const loginUrl = getRedirectUrl("/login", request);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 5. Strict Role-Based Access Control (ACL) for İtfaiye Eri (ER) rank
  const role = getUserRole(session);
  if (role === 'ER') {
    const blockedPathsForEr = [
      "/yonetim/hizmetler",
      "/yonetim/hizmet-basvurulari",
      "/yonetim/personel",
      "/yonetim/personel-yonetimi",
      "/yonetim/yetkiler",
      "/yonetim/raporlar",
      "/yonetim/istatistikler",
      "/yonetim/sablonlar",
      "/yonetim/harita",
      "/yonetim/egitimler"
    ];

    // Şoförler (Şoför, Pos.Baş.Şof.) Komuta Haritası'na erişebilir; harita bloğundan muaf.
    const isSofor = (session.unvan || "").toLowerCase().includes("şof");
    const effectiveBlocked = isSofor
      ? blockedPathsForEr.filter((p) => p !== "/yonetim/harita")
      : blockedPathsForEr;

    const isBlocked = effectiveBlocked.some((p) => pathname === p || pathname.startsWith(p + "/"));
    
    if (isBlocked) {
      console.warn(`[ACL proxy] ER rank user (${session.sicilNo}) attempted unauthorized access to: ${pathname}`);
      return NextResponse.redirect(getRedirectUrl("/yonetim/403", request));
    }
  }

  // RBAC: Admin-only paths
  const isAdminPath = ADMIN_PATHS.some((p) => pathname.startsWith(p));
  if (isAdminPath) {
    if (session.rol !== "Admin" && session.rol !== "Editor" && session.rol !== "Shift_Leader" && session.rol !== "User") {
      const dashUrl = getRedirectUrl("/", request);
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

