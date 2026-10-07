import bcrypt from "bcryptjs";
import connectPgSimple from "connect-pg-simple";
import type { Request, RequestHandler } from "express";
import session from "express-session";
import { createHash, timingSafeEqual } from "node:crypto";
import pg from "pg";

import { db } from "./db";
import config, { schema } from "./knexfile";

declare module "express-session" {
  interface SessionData {
    userId: string;
    refreshedAt: number;
  }
}

declare module "express-serve-static-core" {
  interface Request {
    userId: string;
  }
}

const isProd = process.env.NODE_ENV === "production";
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const SESSION_REFRESH_MS = 24 * 60 * 60 * 1000; // extend it at most daily
const BCRYPT_ROUNDS = 10;
const MIN_PASSWORD_LEN = 8;
const DEV_SESSION_SECRET = "dev-only-insecure-secret";

// Compared against when no user matches, so a wrong email takes as long as a
// wrong password (no account enumeration by timing).
const DUMMY_HASH = bcrypt.hashSync("unused-placeholder", BCRYPT_ROUNDS);

const sessionSecret = process.env.SESSION_SECRET || DEV_SESSION_SECRET;
// The placeholder is public (it's in .env.example), so it can't sign real cookies.
if (
  isProd &&
  (sessionSecret === DEV_SESSION_SECRET || sessionSecret.length < 32)
) {
  throw new Error(
    "SESSION_SECRET must be set to a random value of 32+ characters in production",
  );
}

const PgSession = connectPgSimple(session);

// Session cookie: httpOnly (unreadable by page scripts), sameSite=lax (blocks
// cross-site writes), secure in production. The session table is created by a
// migration, like every other table.
export const sessionMiddleware = session({
  name: "herofolio.sid",
  store: new PgSession({
    // connect-pg-simple needs a node-postgres Pool rather than knex's. Keep it
    // small: the production database is shared with other apps.
    pool: new pg.Pool({ ...(config.connection as pg.PoolConfig), max: 3 }),
    schemaName: schema,
    tableName: "session",
    // Rather than rewriting the session on every request, refreshSession
    // extends it once a day.
    disableTouch: true,
  }),
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    maxAge: SESSION_MAX_AGE_MS,
  },
});

// Changing the session makes express-session save it and resend the cookie,
// both with a fresh 30-day expiry. Doing that daily keeps active users signed
// in without a write on every request.
export const refreshSession: RequestHandler = (req, _res, next) => {
  const { userId, refreshedAt = 0 } = req.session;
  if (userId && Date.now() - refreshedAt > SESSION_REFRESH_MS) {
    req.session.refreshedAt = Date.now();
  }
  next();
};

// ─── Rate limit (per IP, in memory) ───────────────────────────────────────────
// Blunts password and invite-code guessing. A reset on redeploy only ever frees
// a locked-out attacker, so memory is fine. A successful sign-in doesn't clear
// the count, or an attacker could reset it by signing into their own account
// between guesses; failures expire 15 minutes after the last one.

const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;
const PRUNE_THRESHOLD = 1000;
const failures = new Map<
  string,
  { count: number; lockedUntil: number; expires: number }
>();

// Render sits behind Cloudflare, which sets CF-Connecting-IP to the visitor on
// every request and rejected a client-supplied one in our test. If it's ever
// missing, fall back to req.ip, which trust proxy resolves to the visitor from
// X-Forwarded-For by skipping Cloudflare's and Render's addresses (proxy.ts),
// so visitors still get separate counts. A request sent from inside Cloudflare
// can choose req.ip, so it's fine as this fallback but must not feed any other
// security decision.
function clientIp(req: Request) {
  return (isProd && req.get("cf-connecting-ip")) || req.ip || "unknown";
}

function isLockedOut(ip: string) {
  const rec = failures.get(ip);
  return !!rec && rec.lockedUntil > Date.now();
}

function registerFailure(req: Request) {
  const ip = clientIp(req);
  const now = Date.now();
  if (failures.size > PRUNE_THRESHOLD) {
    for (const [key, rec] of failures)
      if (rec.expires <= now) failures.delete(key);
  }
  const existing = failures.get(ip);
  const rec =
    existing && existing.expires > now
      ? existing
      : { count: 0, lockedUntil: 0, expires: 0 };
  rec.count += 1;
  if (rec.count >= MAX_FAILURES) {
    rec.lockedUntil = now + LOCK_MS;
    rec.count = 0;
  }
  rec.expires = now + LOCK_MS;
  failures.set(ip, rec);
  // Logged so production can confirm each visitor gets their own count, and
  // that the header and X-Forwarded-For agree. The raw X-Forwarded-For shows
  // the proxy chain if req.ip is ever wrong. The client controls its start, so
  // only the last 512 characters (the end the proxies appended) are logged.
  const forwardedFor = (req.get("x-forwarded-for") ?? "").slice(-512);
  console.warn(
    `Failed auth attempt from ${ip} (req.ip ${req.ip}, ` +
      `X-Forwarded-For ${JSON.stringify(forwardedFor)})` +
      (rec.lockedUntil > now ? ", locked out" : ""),
  );
}

const tooManyAttempts = {
  error: "Too many attempts. Try again in a few minutes.",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

type UserRow = {
  id: string;
  email: string;
  name: string | null;
  passwordHash: string | null;
};

const publicUser = (user: UserRow) => ({
  id: user.id,
  email: user.email,
  name: user.name,
});

const findByEmail = (email: string): Promise<UserRow | undefined> =>
  db("users").whereRaw("lower(email) = lower(?)", [email.trim()]).first();

// The account behind the request's session, if any. Shared by `me` and
// `requireAuth` so they always agree on who is signed in.
async function currentUser(req: Request): Promise<UserRow | undefined> {
  const { userId } = req.session;
  return userId ? db("users").where({ id: userId }).first() : undefined;
}

// Reads the named body fields, or null if any is missing or not a string, so
// odd input gets a 400 instead of throwing.
function stringFields<K extends string>(
  body: unknown,
  required: K[],
): Record<K, string> | null {
  const fields = (body ?? {}) as Record<string, unknown>;
  const values = {} as Record<K, string>;
  for (const key of required) {
    const value = fields[key];
    if (typeof value !== "string" || !value) return null;
    values[key] = value;
  }
  return values;
}

// Compare digests so the check takes the same time whatever the input length.
function inviteCodeMatches(code: string) {
  const expected = process.env.SIGNUP_INVITE_CODE;
  if (!expected) return false;
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(code.trim()), digest(expected));
}

// Issue a fresh session id on sign-in, so a pre-login (possibly planted) id is
// never promoted to an authenticated one.
async function startSession(req: Request, userId: string) {
  await new Promise<void>((resolve, reject) =>
    req.session.regenerate((err) => (err ? reject(err) : resolve())),
  );
  req.session.userId = userId;
  req.session.refreshedAt = Date.now();
  await new Promise<void>((resolve, reject) =>
    req.session.save((err) => (err ? reject(err) : resolve())),
  );
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export const signUp: RequestHandler = async (req, res) => {
  if (isLockedOut(clientIp(req))) {
    res.status(429).json(tooManyAttempts);
    return;
  }
  const fields = stringFields(req.body, ["email", "password", "inviteCode"]);
  if (!fields) {
    res
      .status(400)
      .json({ error: "Email, password, and invite code are required" });
    return;
  }
  const { email, password, inviteCode } = fields;
  const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
  if (!inviteCodeMatches(inviteCode)) {
    registerFailure(req);
    res.status(403).json({ error: "That invite code isn't valid" });
    return;
  }
  if (password.length < MIN_PASSWORD_LEN) {
    res.status(400).json({
      error: `Password must be at least ${MIN_PASSWORD_LEN} characters`,
    });
    return;
  }
  // An existing row, even one without a password yet, can't be claimed here.
  if (await findByEmail(email)) {
    res.status(409).json({ error: "That email already has an account" });
    return;
  }
  const [user] = await db("users")
    .insert({
      email: email.trim(),
      name: name || null,
      passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
    })
    .returning("*");
  await startSession(req, user.id);
  res.status(201).json({ user: publicUser(user) });
};

export const login: RequestHandler = async (req, res) => {
  if (isLockedOut(clientIp(req))) {
    res.status(429).json(tooManyAttempts);
    return;
  }
  const fields = stringFields(req.body, ["email", "password"]);
  if (!fields) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }
  const user = await findByEmail(fields.email);
  const ok = await bcrypt.compare(
    fields.password,
    user?.passwordHash ?? DUMMY_HASH,
  );
  if (!user?.passwordHash || !ok) {
    registerFailure(req);
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }
  await startSession(req, user.id);
  res.json({ user: publicUser(user) });
};

export const logout: RequestHandler = (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("herofolio.sid");
    res.json({ user: null });
  });
};

export const me: RequestHandler = async (req, res) => {
  const user = await currentUser(req);
  res.json({ user: user ? publicUser(user) : null });
};

// Fails closed, and re-reads the account on every request so a deleted user
// loses access immediately instead of riding a still-valid session.
export const requireAuth: RequestHandler = async (req, res, next) => {
  const user = await currentUser(req);
  if (!user) {
    res.status(401).json({ error: "Sign in required" });
    return;
  }
  req.userId = user.id;
  next();
};

// Requires the current password (rate-limited like sign-in), so a borrowed
// device or stolen cookie can't take over the account. Signs out every other
// session, since the password change may be in response to one of them.
export const changePassword: RequestHandler = async (req, res) => {
  if (isLockedOut(clientIp(req))) {
    res.status(429).json(tooManyAttempts);
    return;
  }
  const fields = stringFields(req.body, ["currentPassword", "newPassword"]);
  if (!fields) {
    res.status(400).json({ error: "Current and new passwords are required" });
    return;
  }
  const { currentPassword, newPassword } = fields;
  if (newPassword.length < MIN_PASSWORD_LEN) {
    res.status(400).json({
      error: `New password must be at least ${MIN_PASSWORD_LEN} characters`,
    });
    return;
  }
  const user: UserRow = await db("users").where({ id: req.userId }).first();
  if (
    !(await bcrypt.compare(currentPassword, user.passwordHash ?? DUMMY_HASH))
  ) {
    registerFailure(req);
    res.status(403).json({ error: "Current password is incorrect" });
    return;
  }
  await db.transaction(async (trx) => {
    await trx("users")
      .where({ id: user.id })
      .update({
        passwordHash: await bcrypt.hash(newPassword, BCRYPT_ROUNDS),
        updatedAt: trx.fn.now(),
      });
    await trx("session").whereRaw("sess->>'userId' = ?", [user.id]).del();
  });
  // This device's session was just deleted too; give it a fresh one.
  await startSession(req, user.id);
  res.json({ ok: true });
};

// Gives the bootstrap account (the owner of the seed data) its password, from
// env vars holding only a bcrypt hash. Idempotent: it creates the user if
// missing and sets the hash only if the account doesn't have one yet.
export async function ensureBootstrapUser() {
  const email = process.env.BOOTSTRAP_USER_EMAIL;
  const passwordHash = process.env.BOOTSTRAP_USER_PASSWORD_HASH;
  if (!email || !passwordHash) return;

  const existing = await findByEmail(email);
  if (existing?.passwordHash) return;
  if (existing) {
    await db("users").where({ id: existing.id }).update({ passwordHash });
  } else {
    await db("users").insert({ email, passwordHash });
  }
  console.log(`Bootstrapped account ${email}`);
}
