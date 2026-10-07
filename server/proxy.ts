import proxyaddr from "proxy-addr";

// Express's `trust proxy` for production. Requests reach Render through
// Cloudflare: X-Forwarded-For reads `<visitor>, <Cloudflare edge>, <Render
// proxy (10.x)>`, and the socket peer is another Render proxy (10.x) that isn't
// in the header. Express walks that chain from the socket leftward and stops at
// the first untrusted address, so req.ip is the visitor however many hops
// there are. Client-supplied entries to the visitor's left aren't reached as
// long as the visitor's own address isn't trusted; a request sent from inside
// Cloudflare (a Worker, another tenant's fetch) comes from a trusted address,
// so it can choose req.ip. A hop count would break silently if the path gained
// or lost a hop.

// Published at https://www.cloudflare.com/ips-v4 and /ips-v6 (copied Oct 6,
// 2026). If Cloudflare adds a range, req.ip falls back to an edge address
// until it's added here.
const CLOUDFLARE = [
  "173.245.48.0/20",
  "103.21.244.0/22",
  "103.22.200.0/22",
  "103.31.4.0/22",
  "141.101.64.0/18",
  "108.162.192.0/18",
  "190.93.240.0/20",
  "188.114.96.0/20",
  "197.234.240.0/22",
  "198.41.128.0/17",
  "162.158.0.0/15",
  "104.16.0.0/13",
  "104.24.0.0/14",
  "172.64.0.0/13",
  "131.0.72.0/22",
  "2400:cb00::/32",
  "2606:4700::/32",
  "2803:f800::/32",
  "2405:b500::/32",
  "2405:8100::/32",
  "2a06:98c0::/29",
  "2c0f:f248::/32",
];

const isTrusted = proxyaddr.compile([
  // Render's proxies use private addresses (10.x). Express's names cover
  // 127/8, ::1, 169.254/16, fe80::/10, 10/8, 172.16/12, 192.168/16, fc00::/7.
  "loopback",
  "linklocal",
  "uniquelocal",
  // Carrier-grade NAT space, which some cloud networks use internally. It's
  // never a public address, so no visitor can arrive from it.
  "100.64.0.0/10",
  ...CLOUDFLARE,
]);

// The socket peer (hop 0) is always trusted: on Render nothing reaches the app
// except through its proxy. That keeps X-Forwarded-Proto trusted, so req.secure
// and the Secure session cookie don't depend on which address the proxy
// connects from. Every hop after that must be on the list.
export const trustProxy = (addr: string, i: number) =>
  i === 0 || isTrusted(addr, i);
