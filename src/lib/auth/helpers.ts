import { getServerSession } from "next-auth";
import { authOptions } from "./config";
import { redirect } from "next/navigation";
import { nanoid } from "nanoid";
import type { UserRole } from "@/lib/types";

// Cached session getter
export async function getSession() {
  return getServerSession(authOptions);
}

// Require authentication, redirect if not logged in
export async function requireAuth() {
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }
  return session;
}

// Require specific role(s)
export async function requireRole(...roles: UserRole[]) {
  const session = await requireAuth();
  if (!roles.includes(session.user.role as UserRole)) {
    redirect("/login");
  }
  return session;
}

// Check if user is admin (super_admin or admin)
export async function requireAdmin() {
  return requireRole("super_admin", "admin");
}

// Get the client_id for scoping queries (returns null for admins)
export async function getClientScope(): Promise<string | null> {
  const session = await requireAuth();
  if (session.user.role === "client") {
    return session.user.clientId;
  }
  return null; // Admins see all
}

// Magic link token generation and verification
export function generateMagicToken(userId: string): string {
  const expiry = Date.now() + 15 * 60 * 1000; // 15 minutes
  const payload = `${userId}:${expiry}:${nanoid(16)}`;
  // Simple base64 encoding - in production use proper JWT
  return Buffer.from(payload).toString("base64url");
}

export function verifyMagicToken(token: string): string | null {
  try {
    const payload = Buffer.from(token, "base64url").toString();
    const [userId, expiryStr] = payload.split(":");
    const expiry = parseInt(expiryStr, 10);

    if (Date.now() > expiry) return null; // Expired
    if (!userId) return null;

    return userId;
  } catch {
    return null;
  }
}

// Verify Vercel Cron secret for cron route handlers
export function verifyCronSecret(request: Request): boolean {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return false;
  return authHeader === `Bearer ${process.env.CRON_SECRET}`;
}
