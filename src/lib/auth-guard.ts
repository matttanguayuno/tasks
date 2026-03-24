import { getCurrentUser, type AuthUser } from "@/lib/auth";
import { NextResponse } from "next/server";

interface AuthCheckResult {
  user: AuthUser;
}

/** Check auth and return user. Returns NextResponse error if unauthorized. */
export async function requireAuth(): Promise<AuthCheckResult | NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  return { user };
}

/** Check that user is admin. Returns NextResponse error if not. */
export async function requireAdmin(): Promise<AuthCheckResult | NextResponse> {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;
  if (result.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  return result;
}

/** Check that user has write access. Viewers are blocked. */
export async function requireWriteAccess(): Promise<AuthCheckResult | NextResponse> {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;
  if (result.user.role === "VIEWER") {
    return NextResponse.json({ error: "Read-only access" }, { status: 403 });
  }
  return result;
}

/** Check that user can access a specific project. */
export async function requireProjectAccess(projectId: string): Promise<AuthCheckResult | NextResponse> {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;
  // Admins can access everything
  if (result.user.role === "ADMIN") return result;
  // Viewers scoped to a project can only access that project
  if (result.user.projectId && result.user.projectId !== projectId) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }
  return result;
}
