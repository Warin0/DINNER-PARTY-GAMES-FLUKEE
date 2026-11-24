import type { BingoPub } from "../lib/protocol";
import { shuffle } from "../lib/words";
import type { Game, GameCtx, Player } from "./types";

export interface BingoOptions {
  intervalMs: number;
  pattern: "line" | "full";
  maxWinners?: number;
}

const RANGES = [
  [1, 15],
  [16, 30],
  [31, 45],
  [46, 60],
  [61, 75]
];

/** 5x5 card, columns B-I-N-G-O (1-15 ... 61-75). card[row][col]; centre is 0 = free. */
export function makeCard(): number[][] {
  const cols = RANGES.map(([lo, hi]) => {
    const nums: number[] = [];
    for (let n = lo; n <= hi; n++) nums.push(n);
    return shuffle(nums).slice(0, 5);
  });
  const card = Array.from({ length: 5 }, (_, r) => cols.map((c) => c[r]));
  card[2][2] = 0;
  return card;
}

export function hasWin(card: number[][], called: Set<number>, pattern: "line" | "full"): boolean {
  const ok = (r: number, c: number) => card[r][c] === 0 || called.has(card[r][c]);
  const all = [0, 1, 2, 3, 4];
  if (pattern === "full") return all.every((r) => all.every((c) => ok(r, c)));
  if (all.some((r) => all.every((c) => ok(r, c)))) return true;
  if (all.some((c) => all.every((r) => ok(r, c)))) return true;
  if (all.every((i) => ok(i, i))) return true;
  if (all.every((i) => ok(i, 4 - i))) return true;
  return false;
}

const PRIZES = [300, 200, 100];

export class BingoGame implements Game {
  id = "bingo" as const;
  stage: BingoPub["stage"] = "running";
  pattern: "line" | "full";
  intervalMs: number;
  maxWinners: number;
  called: number[] = [];
  winners: { id: string; name: string; place: number }[] = [];
  cards = new Map<string, number[][]>();
  private bag: number[];
  private nextAt: number;
  private locks = new Map<string, number>();

  constructor(private ctx: GameCtx, opts: BingoOptions) {
    this.pattern = opts.pattern;
    this.intervalMs = opts.intervalMs;
    this.maxWinners = opts.maxWinners ?? 3;
    this.bag = shuffle(Array.from({ length: 75 }, (_, i) => i + 1));
    this.nextAt = ctx.now() + Math.min(3000, opts.intervalMs);
    for (const p of ctx.players.values()) this.deal(p);
  }

  private deal(p: Player) {
    let card = this.cards.get(p.id);
    if (!card) {
      card = makeCard();
      this.cards.set(p.id, card);
    }
    this.ctx.send(p.id, { t: "card", card });
  }

  onJoin(p: Player) {
    this.deal(p);
  }

  onMsg(p: Player, m: any): void {
    if (m.t !== "claim" || this.stage !== "running") return;
    const now = this.ctx.now();
    if ((this.locks.get(p.id) ?? 0) > now) {
      this.ctx.send(p.id, { t: "claimResult", ok: false, msg: "locked", lockMs: this.locks.get(p.id)! - now });
      return;
    }
    if (this.winners.some((w) => w.id === p.id)) return;
    const card = this.cards.get(p.id);
    if (card && hasWin(card, new Set(this.called), this.pattern)) {
      const place = this.winners.length + 1;
      this.winners.push({ id: p.id, name: p.name, place });
      this.ctx.award(p.id, PRIZES[place - 1] ?? 50);
      this.ctx.send(p.id, { t: "claimResult", ok: true, place, msg: "BINGO!" });
      if (this.winners.length >= this.maxWinners) this.stage = "over";
      this.ctx.syncScores();
    } else {
      this.locks.set(p.id, now + 8000);
      this.ctx.send(p.id, { t: "claimResult", ok: false, msg: "false", lockMs: 8000 });
    }
    this.ctx.touch();
  }

  tick(now: number): void {
    if (this.stage !== "running") return;
    if (now >= this.nextAt) {
      const n = this.bag.pop();
      if (n === undefined) {
        this.stage = "over";
        this.ctx.syncScores();
      } else {
        this.called.push(n);
        this.nextAt = now + this.intervalMs;
      }
      this.ctx.touch();
    }
  }

  stop(): void {}

  pub(): BingoPub {
    return {
      stage: this.stage,
      pattern: this.pattern,
      called: this.called,
      intervalMs: this.intervalMs,
      nextAt: this.nextAt,
      winners: this.winners.map(({ name, place }) => ({ name, place }))
    };
  }
}
