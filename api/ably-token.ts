import * as Ably from "ably";

// Vercel serverless function: issues short-lived Ably tokens so the API key never reaches the browser.
export default async function handler(req: any, res: any) {
  const key = process.env.ABLY_API_KEY;
  if (!key) {
    res.status(500).json({ error: "ABLY_API_KEY is not set" });
    return;
  }
  try {
    const rest = new Ably.Rest({ key });
    const clientId = typeof req.query?.clientId === "string" ? req.query.clientId.slice(0, 64) : undefined;
    const tokenRequest = await rest.auth.createTokenRequest({
      capability: { "opl:*": ["publish", "subscribe"] },
      ttl: 6 * 60 * 60 * 1000,
      ...(clientId ? { clientId } : {})
    });
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json(tokenRequest);
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}
