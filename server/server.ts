import compression from "compression";
import express, { type ErrorRequestHandler } from "express";
import helmet from "helmet";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ensureBootstrapUser,
  refreshSession,
  sessionMiddleware,
} from "./auth";
import { db } from "./db";
import { api } from "./routes";

const PORT = Number(process.env.PORT) || 4002;
const isProd = process.env.NODE_ENV === "production";
const BUILD_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../build");

const app = express();

// Render's proxy sits behind Cloudflare, and each appends to X-Forwarded-For:
// Cloudflare adds the visitor, then Render's proxy adds the Cloudflare edge.
// Trusting those two hops makes req.ip the visitor and req.secure true (so the
// secure session cookie is sent). The rate limiter prefers CF-Connecting-IP
// (see auth.ts).
if (isProd) app.set("trust proxy", 2);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        // index.html loads a Font Awesome kit, which fetches its icon CSS.
        // Google Fonts are already covered by helmet's https: style/font
        // defaults.
        scriptSrc: ["'self'", "https://kit.fontawesome.com"],
        connectSrc: ["'self'", "https://ka-f.fontawesome.com", "https://ka-p.fontawesome.com"],
      },
    },
  }),
);
app.use(compression());

// Render's health check. It sits ahead of the session store so it never
// touches the database.
app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

// In development Vite proxies /api here, so the browser stays same-origin. In
// production this server also serves the built frontend from the same origin.
app.use("/api", express.json(), sessionMiddleware, refreshSession, api);
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found" });
});

if (isProd) {
  // Vite fingerprints everything in assets/, so it can be cached for good.
  app.use(
    "/assets",
    express.static(path.join(BUILD_DIR, "assets"), { immutable: true, maxAge: "1y" }),
  );
  app.use(express.static(BUILD_DIR));
  // Client-side routes (/characters/..., /login) all load the app. A missing
  // asset or file (anything under /assets, or with an extension) is a 404, not
  // an HTML page the browser would try to run as a script.
  app.get("/{*path}", (req, res) => {
    if (req.path.startsWith("/assets/") || path.extname(req.path)) {
      res.status(404).type("text").send("Not found");
      return;
    }
    res.sendFile("index.html", { root: BUILD_DIR });
  });
}

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
