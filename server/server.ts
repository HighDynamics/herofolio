import compression from "compression";
import express, { type ErrorRequestHandler } from "express";
import helmet from "helmet";

import {
  ensureBootstrapUser,
  refreshSession,
  sessionMiddleware,
} from "./auth";
import { db } from "./db";
import { api } from "./routes";

const PORT = Number(process.env.PORT) || 4002;

const app = express();

// Behind Render's proxy, trust it so req.secure is true and the session
// cookie (secure in production) is sent. Render's proxy appends to
// X-Forwarded-For behind Cloudflare, so req.ip is an edge address there; the
// rate limiter reads the client from True-Client-IP instead (see auth.ts).
if (process.env.NODE_ENV === "production") app.set("trust proxy", 1);

app.use(helmet());
app.use(compression());

// Render's health check. It sits ahead of the session store so it never
// touches the database.
app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use(express.json());
app.use(sessionMiddleware);
app.use(refreshSession);

// In development Vite proxies /api here, so the browser stays same-origin.
app.use("/api", api);

const handleError: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
};
app.use(handleError);

// Refuse to serve a schema the code doesn't match. Migrations run on deploy
// (npm run migrate), so pending ones mean that step was skipped or failed.
// Knex also throws here if the database has migrations this code doesn't know.
const [, pending]: [unknown, { file: string }[]] = await db.migrate.list();
if (pending.length) {
  console.error(
    `Refusing to start: ${pending.length} pending migration(s): ` +
      `${pending.map((m) => m.file).join(", ")}. Run npm run migrate first.`,
  );
  process.exit(1);
}

await ensureBootstrapUser();

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
