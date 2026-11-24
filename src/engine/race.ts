import type { RacePub } from "../lib/protocol";
import type { Game, GameCtx, Player } from "./types";

export interface RaceOptions {
  target: number;
  seconds: number;
  countdownMs?: number;
  /** race ends this long after this many players have finished */
  finishCap?: number;
}

const PRIZES = [300, 200, 100];
const MAX_STEPS_PER_SECOND = 14;

export class RaceGame implements Game {
  id = "race" as const;
  minPubMs = 2000;
  stage: RacePub["stage"] = "countdown";
  target: number;
  seconds: number;
  startAt: number;
  endsAt: number;
  finishCap: number;
  steps = new Map<string, number>();
  finished: { id: string; at: number }[] = [];
  private capHitAt = 0;

  constructor(private ctx: GameCtx, opts: RaceOptions) {
    this.target = opts.target;
    this.seconds = opts.seconds;
    this.finishCap = opts.finishCap ?? 10;
    this.startAt = ctx.now() + (opts.countdownMs ?? 5000);
    this.endsAt = this.startAt + opts.seconds * 1000;
  }

  onMsg(p: Player, m: any): void {
    if (m.t !== "steps" || this.stage === "over") return;
    const now = this.ctx.now();
    if (now < this.startAt - 200) return;
    const elapsed = Math.max(0, now - this.startAt) / 1000;
    const allowed = Math.floor(elapsed * MAX_STEPS_PER_SECOND) + 4;
    const prev = this.steps.get(p.id) ?? 0;
    const n = Math.max(prev, Math.min(Math.floor(Number(m.n) || 0), allowed, this.target));
    if (n === prev) return;
    this.steps.set(p.id, n);
    if (n >= this.target && !this.finished.some((f) => f.id === p.id)) {
      this.finished.push({ id: p.id, at: now });
      if (this.finished.length === this.finishCap) this.capHitAt = now;
      this.ctx.touch();
    }
  }

  tick(now: number): void {
    if (this.stage === "countdown" && now >= this.startAt) {
      this.stage = "run";
      this.ctx.touch();
    }
    if (this.stage === "run") {
      const capDone = this.capHitAt > 0 && now - this.capHitAt > 4000;
      if (now >= this.endsAt || capDone) this.finish();
    }
  }

  private finish() {
    this.stage = "over";
    this.finished.forEach((f, i) => this.ctx.award(f.id, PRIZES[i] ?? 50));
    for (const [id, s] of this.steps) {
      if (!this.finished.some((f) => f.id === id)) this.ctx.award(id, Math.round((50 * s) / this.target));
    }
    this.ctx.syncScores();
    this.ctx.touch();
  }

  stop(): void {}

  /** host-only: sorted leaderboard of progress */
  standings(): { id: string; name: string; color: string; steps: number; place?: number }[] {
    const rows = [...this.ctx.players.values()].map((p) => {
      const idx = this.finished.findIndex((f) => f.id === p.id);
      return { id: p.id, name: p.name, color: p.color, steps: this.steps.get(p.id) ?? 0, place: idx >= 0 ? idx + 1 : undefined };
    });
    rows.sort((a, b) => (a.place ?? 1e9) - (b.place ?? 1e9) || b.steps - a.steps);
    return rows;
  }

  pub(): RacePub {
    return {
      stage: this.stage,
      startAt: this.startAt,
      endsAt: this.endsAt,
      target: this.target,
      finishers: this.finished.slice(0, 10).map((f) => this.ctx.players.get(f.id)?.name ?? "?")
    };
  }
}
