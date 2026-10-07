import express from "express";
import session from "express-session";
import type { AddressInfo } from "node:net";
import proxyaddr from "proxy-addr";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { trustProxy } from "./proxy";

// Requests to the test server come from loopback, standing in for the Render
// proxy that connects to the app. The addresses are from production's logs
// (Oct 6).
const VISITOR = "104.60.164.120";
const CLOUDFLARE_EDGE = "172.71.147.212";
const RENDER_PROXY = "10.207.4.17";

// What a request carries after Cloudflare and Render's proxy have appended to
// it, with anything the client sent first.
const forwardedFor = (...clientSent: string[]) =>
  [...clientSent, VISITOR, CLOUDFLARE_EDGE, RENDER_PROXY].join(", ");

async function serve(trust: unknown) {
  const app = express();
  app.set("trust proxy", trust);
  app.use(
    session({
      secret: "test-secret",
      resave: false,
      saveUninitialized: false,
      cookie: { secure: true },
    }),
  );
  app.get("/", (req, res) => {
    req.session.userId = "user";
    res.json({ ip: req.ip, secure: req.secure });
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve).once("error", reject);
  });
  const { port } = server.address() as AddressInfo;
  const get = async (xff: string) => {
    const res = await fetch(`http://127.0.0.1:${port}/`, {
      headers: { "X-Forwarded-For": xff, "X-Forwarded-Proto": "https" },
    });
    const body = (await res.json()) as { ip: string; secure: boolean };
    return { ...body, cookie: res.headers.get("set-cookie") ?? "" };
  };
  return { get, close: () => server.close() };
}

// req.ip as Express resolves it (with proxy-addr), from a socket peer the test
// server can't bind as.
const resolve = (peer: string, xff?: string) =>
  proxyaddr(
    {
      headers: xff ? { "x-forwarded-for": xff } : {},
      socket: { remoteAddress: peer },
    } as unknown as Parameters<typeof proxyaddr>[0],
    trustProxy,
  );

describe("trust proxy by address", () => {
  let server: Awaited<ReturnType<typeof serve>>;
  beforeAll(async () => {
    server = await serve(trustProxy);
  });
  afterAll(() => server.close());

  it("resolves a visitor behind Cloudflare and Render's proxy", async () => {
    expect((await server.get(forwardedFor())).ip).toBe(VISITOR);
  });

  it("ignores spoofed X-Forwarded-For entries on the left", async () => {
    expect((await server.get(forwardedFor("5.6.7.8"))).ip).toBe(VISITOR);
    // Even one that claims to be a Cloudflare edge.
    expect((await server.get(forwardedFor("5.6.7.8", "173.245.48.1"))).ip).toBe(
      VISITOR,
    );
  });

  it("doesn't depend on the number of hops", async () => {
    expect((await server.get(`${VISITOR}, ${CLOUDFLARE_EDGE}`)).ip).toBe(
      VISITOR,
    );
    expect(
      (await server.get(`${forwardedFor()}, 10.207.9.9, 100.64.0.1`)).ip,
    ).toBe(VISITOR);
  });

  it("resolves an IPv6 visitor through Cloudflare's IPv6 edge", async () => {
    const ip = (await server.get(`2001:db8::1, 2606:4700::1, ${RENDER_PROXY}`))
      .ip;
    expect(ip).toBe("2001:db8::1");
  });

  it("keeps req.secure true, so the session cookie is sent as Secure", async () => {
    const { secure, cookie } = await server.get(forwardedFor());
    expect(secure).toBe(true);
    expect(cookie).toMatch(/^connect\.sid=.*; Secure/);
  });
});

describe("trust proxy from Render's socket peer", () => {
  it("resolves the visitor from a 10.x peer, plain or IPv4-mapped", () => {
    expect(resolve("10.207.4.18", forwardedFor("5.6.7.8"))).toBe(VISITOR);
    expect(resolve("::ffff:10.207.4.18", forwardedFor("5.6.7.8"))).toBe(
      VISITOR,
    );
    expect(
      resolve(
        "::ffff:10.207.4.18",
        "::ffff:104.60.164.120, ::ffff:172.71.147.212",
      ),
    ).toBe("::ffff:104.60.164.120");
  });

  // req.secure (and so the Secure cookie) trusts X-Forwarded-Proto only when
  // the socket peer is trusted, which it always is.
  it("always trusts the socket peer, whatever its address", () => {
    expect(trustProxy("10.207.4.18", 0)).toBe(true);
    expect(trustProxy("::ffff:10.207.4.18", 0)).toBe(true);
    expect(trustProxy("203.0.113.9", 0)).toBe(true);
    expect(trustProxy("203.0.113.9", 1)).toBe(false);
    expect(trustProxy("::ffff:172.71.147.212", 2)).toBe(true);
  });

  it("stops at an untrusted hop that isn't Cloudflare", () => {
    // A chain that skipped Cloudflare: its last public hop is req.ip, and
    // anything to the left is ignored.
    expect(resolve(RENDER_PROXY, `5.6.7.8, 203.0.113.9, ${RENDER_PROXY}`)).toBe(
      "203.0.113.9",
    );
    // A direct connection with no chain is its own address.
    expect(resolve("203.0.113.9")).toBe("203.0.113.9");
  });
});

describe("regression: trust proxy 2", () => {
  // The old setting, reproducing production's log line (req.ip 172.71.147.212),
  // which also shows the chain above is the real one.
  it("gave the Cloudflare edge where the new setting gives the visitor", async () => {
    const old = await serve(2);
    try {
      expect((await old.get(forwardedFor())).ip).toBe(CLOUDFLARE_EDGE);
    } finally {
      old.close();
    }
    expect(resolve(RENDER_PROXY, forwardedFor())).toBe(VISITOR);
  });
});
