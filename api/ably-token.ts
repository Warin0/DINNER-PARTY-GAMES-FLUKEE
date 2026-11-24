import * as Ably from "ably";
import { createHash, timingSafeEqual } from "node:crypto";

// Vercel serverless function: issues short-lived Ably tokens so the API key never reaches the browser.
//  - role=host   needs HOST_PASSWORD (if set); gets full access to the room's channels
//  - role=player gets the minimum: subscribe to state + own private channel, publish to the host inbox only
// so a player can never publish game state or impersonate the host.

const sha = (s: string) => createHash("sha256").update(s).digest();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default async function handler(req: any, res: any) {
  const key = process.env.ABLY_API_KEY;
  if (!key) return res.status(500).json({ error: "ABLY_API_KEY is not set" });

  const p: Record<string, any> = { ...(req.query || {}), ...(typeof req.body === "object" && req.body ? req.body : {}) };
  const role = p.role === "host" ? "host" : "player";
  const room = String(p.room || "");
  if (!/^[A-Z]{4}$/.test(room)) return res.status(400).json({ error: "bad room" });

  let capability: Record<string, Ably.capabilityOp[]>;
  let clientId: string;

  if (role === "host") {
    const expected = process.env.HOST_PASSWORD;
    if (expected) {
      const given = String(p.password || "");
      if (!timingSafeEqual(sha(given), sha(expected))) {
        await sleep(800); // slow down guessing
        return res.status(401).json({ error: "wrong password" });
      }
    }
    clientId = `host-${room}`;
    capability = { [`opl:${room}:*`]: ["publish", "subscribe"] };
  } else {
    const pid = String(p.pid || "");
    if (!/^[a-z0-9]{4,24}$/.test(pid)) return res.status(400).json({ error: "bad player id" });
    clientId = `p-${pid}`;
    capability = {
      [`opl:${room}:state`]: ["subscribe", "history"],
      [`opl:${room}:in:*`]: ["publish"],
      [`opl:${room}:p:${pid}`]: ["subscribe"]
    };
  }

  try {
    const rest = new Ably.Rest({ key });
    const tokenRequest = await rest.auth.createTokenRequest({ capability, clientId, ttl: 6 * 60 * 60 * 1000 });
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(tokenRequest);
  } catch (e: any) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
