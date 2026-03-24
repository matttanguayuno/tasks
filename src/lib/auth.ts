import { prisma } from "./prisma";
import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";

const SESSION_COOKIE = "asanalite_session";
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface AuthUser {
  id: string;
  username: string;
  role: "ADMIN" | "VIEWER";
  projectId: string | null;
}

/** Get current user from session cookie. Returns null if not authenticated. */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!session || session.expiresAt < new Date()) {
    if (session) {
      await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    }
    return null;
  }

  return {
    id: session.user.id,
    username: session.user.username,
    role: session.user.role as "ADMIN" | "VIEWER",
    projectId: session.user.projectId,
  };
}

/** Create a session for a user and set cookies. */
export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await prisma.session.create({
    data: { token, userId, expiresAt },
  });

  const user = await prisma.appUser.findUniqueOrThrow({ where: { id: userId } });

  const cookieStore = await cookies();
  const cookieOpts = { httpOnly: true, sameSite: "lax" as const, path: "/", expires: expiresAt };

  cookieStore.set(SESSION_COOKIE, token, cookieOpts);
  cookieStore.set("asanalite_role", user.role, cookieOpts);
  if (user.projectId) {
    cookieStore.set("asanalite_project", user.projectId, cookieOpts);
  }

  return token;
}

/** Destroy the current session. */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { token } });
  }
  const clearOpts = { httpOnly: true, path: "/", maxAge: 0 };
  cookieStore.set(SESSION_COOKIE, "", clearOpts);
  cookieStore.set("asanalite_role", "", clearOpts);
  cookieStore.set("asanalite_project", "", clearOpts);
}

/** Hash a password. */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

/** Verify a password against a hash. */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** Ensure at least one admin user exists. Creates default admin if none. */
export async function ensureAdminExists(): Promise<void> {
  const adminCount = await prisma.appUser.count({ where: { role: "ADMIN" } });
  if (adminCount === 0) {
    const username = process.env.ADMIN_USERNAME || "admin";
    const password = process.env.ADMIN_PASSWORD || "admin";
    const hash = await hashPassword(password);
    await prisma.appUser.create({
      data: { username, password: hash, role: "ADMIN" },
    });
  }
}
