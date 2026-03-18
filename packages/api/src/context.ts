import { createHash } from "node:crypto";
import { auth } from "@myagents/auth";
import prisma from "@myagents/db";
import type { Context as HonoContext } from "hono";

export type CreateContextOptions = {
  context: HonoContext;
};

type SessionResult = Awaited<ReturnType<typeof auth.api.getSession>>;

/**
 * Authenticate via API key in Authorization: Bearer <key> header.
 * Returns a session-compatible object matching Better Auth's shape.
 */
async function authenticateApiKeyFromHeader(
  headers: Headers,
): Promise<SessionResult> {
  const authHeader = headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const apiKey = authHeader.slice(7);
  if (!apiKey) return null;

  const keyHash = createHash("sha256").update(apiKey).digest("hex");
  const record = await prisma.apiKey.findFirst({
    where: { keyHash },
    select: { userId: true, id: true },
  });
  if (!record) return null;

  // Update lastUsedAt
  void prisma.apiKey.update({
    where: { id: record.id },
    data: { lastUsedAt: new Date() },
  });

  // Look up the full user record to build a session-compatible object
  const user = await prisma.user.findUnique({
    where: { id: record.userId },
  });
  if (!user) return null;

  // Build a session-shaped object matching Better Auth's return type
  const now = new Date();
  return {
    session: {
      id: `apikey-${record.id}`,
      createdAt: now,
      updatedAt: now,
      userId: user.id,
      expiresAt: new Date(Date.now() + 86400000),
      token: `apikey-${record.id}`,
    },
    user: user,
  } as SessionResult;
}

export async function createContext({ context }: CreateContextOptions) {
  // Try session auth first, then fall back to API key auth
  const session = await auth.api.getSession({
    headers: context.req.raw.headers,
  });

  if (session) {
    return { session };
  }

  // Fall back to API key auth (for CLI clients)
  const apiKeySession = await authenticateApiKeyFromHeader(
    context.req.raw.headers,
  );
  return { session: apiKeySession };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
