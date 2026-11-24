// Offline test of the Vercel token function (createTokenRequest signs locally, no network needed).
import handler from "../api/ably-token";

process.env.ABLY_API_KEY = "appid.keyid:secretsecretsecret";
let fails = 0;
const ok = (n: string, c: boolean, x = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${n} ${x}`); if (!c) fails++; };

async function call(params: Record<string, string>) {
  let status = 0, body: any;
  const res: any = { setHeader() {}, status(s: number) { status = s; return this; }, json(b: any) { body = b; return this; } };
  await handler({ query: {}, body: params }, res);
  return { status, body };
}

process.env.HOST_PASSWORD = "s3cret";
let r = await call({ role: "host", room: "ABCD" });
ok("host without password rejected (401)", r.status === 401);
r = await call({ role: "host", room: "ABCD", password: "nope" });
ok("host wrong password rejected (401)", r.status === 401);
r = await call({ role: "host", room: "ABCD", password: "s3cret" });
ok("host right password gets token", r.status === 200 && r.body.clientId === "host-ABCD");
ok("host can publish+subscribe its room", JSON.parse(r.body.capability)["opl:ABCD:*"]?.includes("publish"));
ok("host token limited to its own room", !JSON.stringify(JSON.parse(r.body.capability)).includes("opl:*\""));

r = await call({ role: "player", room: "ABCD", pid: "abc123def4" });
ok("player gets token without password", r.status === 200 && r.body.clientId === "p-abc123def4");
const cap = JSON.parse(r.body.capability);
ok("player cannot publish to state", !cap["opl:ABCD:state"].includes("publish"));
ok("player can only publish to inbox", cap["opl:ABCD:in:*"].join() === "publish");
ok("player only reads own private channel", Object.keys(cap).includes("opl:ABCD:p:abc123def4") && Object.keys(cap).length === 3);
ok("role defaults to player even if role=admin", (await call({ role: "admin", room: "ABCD", pid: "abc123def4" })).body.clientId.startsWith("p-"));
ok("bad room rejected", (await call({ role: "player", room: "../x", pid: "abc123def4" })).status === 400);
ok("bad player id rejected", (await call({ role: "player", room: "ABCD", pid: "x*" })).status === 400);
delete process.env.HOST_PASSWORD;
ok("no HOST_PASSWORD set -> host open (dev)", (await call({ role: "host", room: "ABCD" })).status === 200);
console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
process.exit(fails ? 1 : 0);
