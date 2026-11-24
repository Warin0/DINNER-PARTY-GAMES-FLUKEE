import { COLORS, SHARDS, channels, type GameId, type InMsg, type PrivMsg, type PubState } from "../lib/protocol";
import type { Transport } from "../lib/transport";
import { BingoGame, type BingoOptions } from "./bingo";
import { DrawGame, type DrawOptions } from "./draw";
import { RaceGame, type RaceOptions } from "./race";
import type { Game, GameCtx, Player } from "./types";

export type StartOptions =
  | { game: "draw"; opts: DrawOptions }
  | { game: "bingo"; opts: BingoOptions }
  | { game: "race"; opts: RaceOptions };

const ONLINE_MS = 45_000;

/** The host screen is the referee: it owns all game state and publishes small public snapshots. */
export class HostEngine {
  players = new Map<string, Player>();
  phase: "lobby" | "game" = "lobby";
  game: Game | null = null;
  rev = 0;
  listeners = new Set<() => void>();

  private dirty = true;
  private lastPub = 0;
  private unsubs: (() => void)[] = [];
  private timer: ReturnType<typeof setInterval>;
  private colorIdx = 0;

  constructor(public tr: Transport, public room: string, private clock: () => number = Date.now) {
    for (let i = 0; i < SHARDS; i++) {
      this.unsubs.push(tr.subscribe(channels.inbox(room, i), (m) => this.onMessage(m as InMsg)));
    }
    this.timer = setInterval(() => this.tick(), 200);
    this.publishState();
  }

  ctx: GameCtx = {
    players: this.players,
    now: () => this.clock(),
    send: (id, msg) => this.send(id, msg),
    award: (id, pts) => {
      const p = this.players.get(id);
      if (p) p.score += pts;
    },
    touch: () => this.touch(),
    syncScores: () => this.sendMeToAll(),
    online: (p) => this.clock() - p.lastSeen < ONLINE_MS
  };

  // ---------- messaging ----------
  private send(id: string, msg: PrivMsg) {
    this.tr.publish(channels.priv(this.room, id), msg);
  }

  private onMessage(m: InMsg) {
    if (!m || typeof m !== "object" || typeof (m as any).id !== "string") return;
    const now = this.clock();
    if (m.t === "join") {
      let p = this.players.get(m.id);
      if (!p) {
        p = {
          id: m.id,
          name: cleanName(m.name),
          color: COLORS[this.colorIdx++ % COLORS.length],
          score: 0,
          ready: false,
          lastSeen: now
        };
        this.players.set(p.id, p);
      } else {
        p.lastSeen = now;
      }
      this.send(p.id, { t: "welcome", id: p.id, name: p.name, color: p.color, score: p.score, ready: p.ready });
      this.game?.onJoin?.(p);
      this.touch();
      return;
    }
    const p = this.players.get(m.id);
    if (!p) {
      this.send(m.id, { t: "unknown" });
      return;
    }
    const wasOnline = this.ctx.online(p);
    p.lastSeen = now;
    if (!wasOnline) this.touch();
    switch (m.t) {
      case "hello":
        break;
      case "ready":
        p.ready = !!m.ready;
        this.touch();
        break;
      default:
        this.game?.onMsg(p, m);
    }
  }

  // ---------- control ----------
  startGame(cfg: StartOptions) {
    this.game?.stop();
    switch (cfg.game) {
      case "draw":
        this.game = new DrawGame(this.ctx, cfg.opts);
        break;
      case "bingo":
        this.game = new BingoGame(this.ctx, cfg.opts);
        break;
      case "race":
        this.game = new RaceGame(this.ctx, cfg.opts);
        break;
    }
    this.phase = "game";
    this.touch();
  }

  endGame() {
    this.game?.stop();
    this.game = null;
    this.phase = "lobby";
    this.sendMeToAll();
    this.touch();
  }

  kick(id: string) {
    this.players.delete(id);
    this.touch();
  }

  resetScores() {
    this.players.forEach((p) => (p.score = 0));
    this.sendMeToAll();
    this.touch();
  }

  ranking(): Player[] {
    return [...this.players.values()].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  }

  sendMeToAll() {
    const ranked = this.ranking();
    ranked.forEach((p, i) => this.send(p.id, { t: "me", score: p.score, ready: p.ready, rank: i + 1 }));
  }

  // ---------- state publishing ----------
  touch() {
    this.dirty = true;
    this.listeners.forEach((l) => l());
  }

  private tick() {
    const now = this.clock();
    this.game?.tick(now);
    if (this.dirty && now - this.lastPub >= (this.game?.minPubMs ?? 400)) this.publishState();
    else if (now - this.lastPub >= 10_000) this.publishState();
    this.listeners.forEach((l) => l());
  }

  private publishState() {
    this.dirty = false;
    this.lastPub = this.clock();
    this.rev++;
    const all = [...this.players.values()];
    const state: PubState = {
      t: "state",
      now: this.clock(),
      rev: this.rev,
      room: this.room,
      phase: this.phase,
      game: this.game?.id as GameId | undefined,
      counts: {
        joined: all.length,
        ready: all.filter((p) => p.ready).length,
        online: all.filter((p) => this.ctx.online(p)).length
      },
      top: this.ranking()
        .slice(0, 10)
        .map((p) => ({ name: p.name, score: p.score })),
      g: this.game?.pub()
    };
    this.tr.publish(channels.state(this.room), state);
  }

  /** Push the current personal score/rank to every phone (used when a round ends). */
  broadcastScores() {
    this.sendMeToAll();
  }

  close() {
    clearInterval(this.timer);
    this.unsubs.forEach((u) => u());
    this.game?.stop();
  }
}

function cleanName(n: unknown): string {
  const s = String(n ?? "").replace(/\s+/g, " ").trim().slice(0, 16);
  return s || "Player";
}
