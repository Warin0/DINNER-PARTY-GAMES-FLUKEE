import * as Ably from "ably";

export interface Transport {
  mode: "ably" | "local" | "memory";
  publish(channel: string, data: unknown): void;
  subscribe(channel: string, cb: (data: any) => void): () => void;
  close(): void;
}

// ---------- Ably (production, works across devices) ----------
export class AblyTransport implements Transport {
  mode = "ably" as const;
  private client: Ably.Realtime;
  constructor(clientId?: string) {
    this.client = new Ably.Realtime({
      authUrl: clientId ? `/api/ably-token?clientId=${encodeURIComponent(clientId)}` : "/api/ably-token",
      authMethod: "GET",
      echoMessages: false
    });
  }
  publish(channel: string, data: unknown) {
    void this.client.channels.get(channel).publish("m", data as any);
  }
  subscribe(channel: string, cb: (data: any) => void) {
    const ch = this.client.channels.get(channel);
    const listener = (msg: Ably.Message) => cb(msg.data);
    void ch.subscribe("m", listener);
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
export async function createTransport(clientId?: string): Promise<Transport> {
  const forceLocal = new URLSearchParams(location.search).has("local");
  if (!forceLocal) {
    try {
      const res = await fetch("/api/ably-token" + (clientId ? `?clientId=${encodeURIComponent(clientId)}` : ""));
      const ct = res.headers.get("content-type") || "";
      if (res.ok && ct.includes("json")) return new AblyTransport(clientId);
    } catch {
      /* fall through to local */
    }
  }
  return new LocalTransport();
}
