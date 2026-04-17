import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl;
    const token = req.nextauth.token;

    // Client users can only access portal routes
    if (token?.role === "client") {
      if (!pathname.startsWith("/portal") && !pathname.startsWith("/api")) {
        return NextResponse.redirect(new URL("/portal", req.url));
      }
    }

    // Admin/super_admin trying to access portal gets redirected to dashboard
    if ((token?.role === "admin" || token?.role === "super_admin") && pathname.startsWith("/portal")) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }

    // Inject client_id header for API routes (scoping)
    if (pathname.startsWith("/api") && token?.clientId) {
      const headers = new Headers(req.headers);
      headers.set("x-client-id", token.clientId as string);
      return NextResponse.next({ headers });
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const { pathname } = req.nextUrl;

        // Allow auth routes and cron routes without session
        if (
          pathname.startsWith("/login") ||
          pathname.startsWith("/magic-link") ||
          pathname.startsWith("/verify") ||
          pathname.startsWith("/api/auth") ||
          pathname.startsWith("/api/cron")
        ) {
          return true;
        }

        return !!token;
      },
    },
  }
);

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|logo.svg).*)",
  ],
};
