import { createClient, type Message, type PubSubClient } from "@ably/pubsub-device";

export interface Transport {
  mode: "ably" | "local" | "memory";
  /** human-readable realtime connection status, for diagnostics */
  readonly statusText?: string;
  publish(channel: string, data: unknown): void;
  subscribe(channel: string, cb: (data: any) => void): () => void;
  close(): void;
}

// ---------- Ably (production, works across devices) ----------
export interface AuthOpts {
  role: "host" | "player";
  room: string;
  /** player id (players only) */
  pid?: string;
  /** host password (hosts only) */
  password?: string;
}

function authParams(o: AuthOpts): Record<string, string> {
  const p: Record<string, string> = { role: o.role, room: o.room };
  if (o.pid) p.pid = o.pid;
  if (o.password) p.password = o.password;
  return p;
}

export class UnauthorizedError extends Error {}

function fmtErr(e: any): string {
  if (!e) return "";
  const cause = e.cause?.message ? `: ${e.cause.message}` : "";
  return `${e.message ?? e}${e.code ? ` (code ${e.code}${e.statusCode ? `/${e.statusCode}` : ""}${cause})` : cause}`;
}

export class AblyTransport implements Transport {
  mode = "ably" as const;
  private conn = "connecting";
  private tokenState = "pending";
  private lastError = "";
  private client: PubSubClient;
  /** layered diagnostics: connection state, token fetch result, last realtime error */
  get statusText() {
    return `${this.conn} · token: ${this.tokenState}${this.lastError ? ` · ${this.lastError}` : ""}`;
  }
  constructor(private o: AuthOpts) {
    this.client = createClient({
      // our own token fetch (POST keeps the password out of URLs/logs) so failures show their real cause
      authCallback: (_params, callback) => {
        fetch("/api/ably-token", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams(authParams(o))
        })
          .then(async (res) => {
            const text = await res.text();
            if (!res.ok) throw new Error(`endpoint ${res.status}: ${text.replace(/\s+/g, " ").slice(0, 160)}`);
            let json: any;
            try {
              json = JSON.parse(text);
            } catch {
              throw new Error(`endpoint returned non-JSON: ${text.replace(/\s+/g, " ").slice(0, 120)}`);
            }
            this.tokenState = "received";
            callback(null, json);
          })
          .catch((e: any) => {
            this.tokenState = `FAILED ${String(e?.message ?? e)}`;
            callback(String(e?.message ?? e), null);
          });
      },
      echoMessages: false
    });
    this.client.connection.on((c) => {
      this.conn = c.current;
      if (c.current === "connected") this.tokenState = "ok";
      if (c.reason) this.lastError = fmtErr(c.reason);
    });
  }
  private chan(name: string, rewind = false) {
    return rewind ? this.client.channels.get(name, { params: { rewind: "1" } }) : this.client.channels.get(name);
  }
  publish(channel: string, data: unknown) {
    this.chan(channel).publish("m", data as any).catch((e: any) => {
      this.lastError = `publish failed: ${fmtErr(e)}`;
    });
  }
  subscribe(channel: string, cb: (data: any) => void) {
    // phones replay the most recent public state when they attach, so late joiners never wait for the next update
    const ch = this.chan(channel, this.o.role === "player" && channel.endsWith(":state"));
    const listener = (msg: Message) => cb(msg.data);
    ch.subscribe("m", listener).catch((e: any) => {
      this.lastError = `subscribe failed (${channel.split(":").slice(2).join(":")}): ${fmtErr(e)}`;
    });
    return () => ch.unsubscribe("m", listener);
  }
  close() {
    this.client.close();
  }
}

// ---------- BroadcastChannel (demo/dev: same browser, multiple tabs) ----------
export class LocalTransport implements Transport {
  mode = "local" as const;
  private pubs = new Map<string, BroadcastChannel>();
  private open: BroadcastChannel[] = [];
  publish(channel: string, data: unknown) {
    let bc = this.pubs.get(channel);
    if (!bc) {
      bc = new BroadcastChannel(channel);
      this.pubs.set(channel, bc);
    }
    bc.postMessage(data);
  }
  subscribe(channel: string, cb: (data: any) => void) {
    const bc = new BroadcastChannel(channel);
    bc.onmessage = (e) => cb(e.data);
    this.open.push(bc);
    return () => bc.close();
  }
  close() {
    this.pubs.forEach((b) => b.close());
    this.open.forEach((b) => b.close());
  }
}

// ---------- in-process (tests / simulation) ----------
export class MemoryBus {
  subs = new Map<string, Set<(d: any) => void>>();
  published = 0;
  delivered = 0;
  perSecond: { published: number; delivered: number }[] = [];
  private sec = 0;
  private bucket = { published: 0, delivered: 0 };
  count(kind: "published" | "delivered") {
    const sec = Math.floor(Date.now() / 1000);
    if (sec !== this.sec) {
      if (this.sec) this.perSecond.push(this.bucket);
      this.bucket = { published: 0, delivered: 0 };
      this.sec = sec;
    }
    this[kind]++;
    this.bucket[kind]++;
  }
}
export class MemoryTransport implements Transport {
  mode = "memory" as const;
  constructor(private bus: MemoryBus) {}
  publish(channel: string, data: unknown) {
    this.bus.count("published");
    const set = this.bus.subs.get(channel);
    if (!set) return;
    const copy = JSON.parse(JSON.stringify(data));
    for (const cb of [...set]) {
      this.bus.count("delivered");
      queueMicrotask(() => cb(copy));
    }
  }
  subscribe(channel: string, cb: (data: any) => void) {
    let set = this.bus.subs.get(channel);
    if (!set) this.bus.subs.set(channel, (set = new Set()));
    set.add(cb);
    return () => set!.delete(cb);
  }
  close() {}
}

// Picks Ably when the token endpoint is configured, otherwise falls back to local demo mode.
// Throws UnauthorizedError when a host password is required but missing/wrong.
export async function createTransport(o: AuthOpts): Promise<Transport> {
  const forceLocal = new URLSearchParams(location.search).has("local");
  if (!forceLocal) {
    try {
      const res = await fetch("/api/ably-token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(authParams(o))
      });
      if (res.status === 401) throw new UnauthorizedError("wrong password");
      const ct = res.headers.get("content-type") || "";
      if (res.ok && ct.includes("json")) return new AblyTransport(o);
    } catch (e) {
      if (e instanceof UnauthorizedError) throw e;
      /* fall through to local */
    }
  }
  return new LocalTransport();
}
