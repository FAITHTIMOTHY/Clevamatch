import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { NextFunction, Request, Response } from "express";
import { eq, lt } from "drizzle-orm";
import { db } from "./db/client.js";
import { sessions, users, workspaces } from "./db/schema.js";

const scrypt = promisify(scryptCallback);
const SESSION_COOKIE = "cleva_session";
const SESSION_LENGTH_MS = 14 * 24 * 60 * 60 * 1000;

export interface UserContext {
  id: string;
  workspaceId: string;
  name: string;
  email: string;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [algorithm, salt, expectedHex] = storedHash.split("$");
  if (algorithm !== "scrypt" || !salt || !expectedHex || !/^[a-f0-9]{128}$/i.test(expectedHex)) return false;
  const expected = Buffer.from(expectedHex, "hex");
  const actual = (await scrypt(password, salt, expected.length)) as Buffer;
  return timingSafeEqual(expected, actual);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge: SESSION_LENGTH_MS,
  };
}

export async function createWorkspaceAccount(input: {
  name: string;
  companyName: string;
  email: string;
  password: string;
}): Promise<UserContext> {
  const workspaceId = randomBytes(16).toString("hex");
  const userId = randomBytes(16).toString("hex");
  const now = new Date().toISOString();
  const passwordHash = await hashPassword(input.password);

  await db.batch(
    [
      db.insert(workspaces).values({ id: workspaceId, name: input.companyName, createdAt: now }),
      db.insert(users).values({
        id: userId,
        workspaceId,
        name: input.name,
        email: input.email,
        passwordHash,
        createdAt: now,
      }),
    ],
  );
  return { id: userId, workspaceId, name: input.name, email: input.email };
}

export async function issueSession(userId: string, response: Response): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_LENGTH_MS).toISOString();
  await db.insert(sessions).values({
    id: randomBytes(16).toString("hex"),
    userId,
    tokenHash: hashToken(token),
    expiresAt,
    createdAt: now.toISOString(),
  });
  response.cookie(SESSION_COOKIE, token, cookieOptions());
}

export async function clearSession(request: Request, response: Response): Promise<void> {
  const token = request.cookies?.[SESSION_COOKIE];
  if (typeof token === "string" && token) {
    await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  }
  response.clearCookie(SESSION_COOKIE, { ...cookieOptions(), maxAge: undefined });
}

export async function requireUser(request: Request, response: Response, next: NextFunction): Promise<void> {
  const token = request.cookies?.[SESSION_COOKIE];
  if (typeof token !== "string" || token.length < 32) {
    response.status(401).json({ error: "Please sign in to continue." });
    return;
  }

  const [record] = await db
    .select({
      sessionId: sessions.id,
      sessionExpiresAt: sessions.expiresAt,
      id: users.id,
      workspaceId: users.workspaceId,
      name: users.name,
      email: users.email,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.tokenHash, hashToken(token)))
    .limit(1);

  if (!record || record.sessionExpiresAt <= new Date().toISOString()) {
    if (record) await db.delete(sessions).where(eq(sessions.id, record.sessionId));
    response.clearCookie(SESSION_COOKIE, { ...cookieOptions(), maxAge: undefined });
    response.status(401).json({ error: "Your session has expired. Please sign in again." });
    return;
  }

  request.user = { id: record.id, workspaceId: record.workspaceId, name: record.name, email: record.email };
  await next();
}

export async function removeExpiredSessions(): Promise<void> {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date().toISOString()));
}
