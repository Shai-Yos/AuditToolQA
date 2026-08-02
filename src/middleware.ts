import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const { auth } = NextAuth(authConfig);

export async function middleware(request: NextRequest) {
  const session = await auth();
  const { pathname } = request.nextUrl;

  const role = session?.user?.role;

  // Role-based route protection
  if (role === "ADMIN" && pathname.startsWith("/userDashboard")) {
    return NextResponse.redirect(new URL("/adminDashboard", request.url));
  }
  if (role === "AUDIT_OWNER" && (pathname.startsWith("/adminDashboard") || pathname.startsWith("/userDashboard"))) {
    return NextResponse.redirect(new URL("/auditOwnerDashboard", request.url));
  }
  if (role === "USER" && (pathname.startsWith("/adminDashboard") || pathname.startsWith("/auditOwnerDashboard"))) {
    return NextResponse.redirect(new URL("/userDashboard", request.url));
  }

  const response = NextResponse.next();

  if (session?.user?.email) {
    const isProduction = process.env.NODE_ENV === "production";
    // Set cookie to expire in 1 hour
    response.cookies.set("audit_user_email", session.user.email, {
      maxAge: 60 * 60, // 1 hour in seconds
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: isProduction,
      domain: isProduction ? "audits.ilqhfaatc1vwap2.code1.emi.philips.com" : undefined,
    });
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - uploads (chat file uploads served from public/)
     */
    "/((?!api|_next/static|_next/image|favicon.ico|uploads).*)",
  ],
};