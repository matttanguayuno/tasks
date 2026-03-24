import { NextRequest, NextResponse } from "next/server";

// Paths that don't require authentication
const PUBLIC_PATHS = ["/login", "/api/auth"];

// Methods that mutate data
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// API paths that viewers ARE allowed to write to (none for now)
// const VIEWER_WRITE_PATHS: string[] = [];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method;

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  // Allow Next.js internals and static files
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon") || pathname.endsWith(".ico")) {
    return NextResponse.next();
  }

  // Check for session cookie
  const sessionToken = request.cookies.get("asanalite_session")?.value;
  if (!sessionToken) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Enforce read-only for VIEWER role on API mutations
  const role = request.cookies.get("asanalite_role")?.value;
  if (role === "VIEWER" && pathname.startsWith("/api/") && WRITE_METHODS.has(method)) {
    return NextResponse.json({ error: "Read-only access" }, { status: 403 });
  }

  // Enforce project scoping for viewers on project API routes
  const scopedProject = request.cookies.get("asanalite_project")?.value;
  if (role === "VIEWER" && scopedProject && pathname.startsWith("/api/projects/")) {
    // Extract projectId from path: /api/projects/{projectId}/...
    const match = pathname.match(/^\/api\/projects\/([^/]+)/);
    if (match && match[1] !== scopedProject) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
