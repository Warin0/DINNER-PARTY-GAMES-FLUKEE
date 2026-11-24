import type { DrawPub } from "../lib/protocol";
import { WORDS, normalizeGuess, parseEntry, shuffle } from "../lib/words";
import type { Game, GameCtx, Player } from "./types";

export interface DrawOptions {
  rounds: number;
  seconds: number;
  lang: "en" | "th";
  revealMs?: number;
  /** host-supplied words ("word" or "word|alt|alt") */
  customWords?: string[];
  /** use only the host's words (needs at least one) */
  customOnly?: boolean;
}

export interface Stroke {
  sid: number;
  c: string;
  w: number;
  pts: [number, number][];
}

export interface FeedItem {
  name: string;
  text: string;
  ok: boolean;
  at: number;
}

export class DrawGame implements Game {
  id = "draw" as const;
  minPubMs = 1000;
  stage: DrawPub["stage"] = "draw";
  round = 0;
  rounds: number;
  seconds: number;
  revealMs: number;
  lang: "en" | "th";

  private queue: string[];
  private words: string[];
  private custom: string[];
  private customOnly: boolean;
  private drawerId = "";
  private display = "";
  private accepted: string[] = [];
  private hintMask: boolean[] = [];
  private hintsGiven = 0;
  private startedAt = 0;
  private endsAt = 0;
  private revealUntil = 0;
  private rerolls = 1;
  private solved = new Map<string, number>(); // id -> points
  private solveOrder: string[] = [];
  private guessers = 0;

  // host-only view
  strokes: Stroke[] = [];
  feed: FeedItem[] = [];
  listeners = new Set<(ev: "stroke" | "redraw", s?: Stroke, pts?: [number, number][]) => void>();

  constructor(private ctx: GameCtx, opts: DrawOptions) {
    this.lang = opts.lang;
    this.seconds = opts.seconds;
    this.revealMs = opts.revealMs ?? 6000;
    const ready = [...ctx.players.values()].filter((p) => p.ready);
    this.queue = shuffle(ready.map((p) => p.id));
    this.rounds = Math.max(1, Math.min(opts.rounds, this.queue.length || 1));
    this.custom = (opts.customWords ?? []).filter(Boolean);
    this.customOnly = !!opts.customOnly && this.custom.length > 0;
    this.words = this.pool();
    this.nextRound();
  }

  private pool(): string[] {
    return shuffle(this.customOnly ? this.custom : [...this.custom, ...WORDS[this.lang]]);
  }

  private nextWord(): void {
    if (this.words.length === 0) this.words = this.pool();
    const entry = parseEntry(this.words.pop()!);
    this.display = entry.display;
    this.accepted = entry.accepted;
    this.hintMask = [...entry.display].map((ch) => /[\s\p{P}\p{S}]/u.test(ch));
    this.hintsGiven = 0;
  }

  private nextRound() {
    // drawer = next random ready player who is still around
    let drawer: Player | undefined;
    while (this.queue.length && !drawer) {
      const cand = this.ctx.players.get(this.queue.shift()!);
      if (cand && this.ctx.online(cand)) drawer = cand;
    }
    if (!drawer || this.round >= this.rounds) {
      this.stage = "over";
      this.ctx.touch();
      return;
    }
    this.round++;
    this.stage = "draw";
    this.drawerId = drawer.id;
    this.rerolls = 1;
    this.solved.clear();
    this.solveOrder = [];
    this.strokes = [];
    this.feed = [];
    this.nextWord();
    this.startedAt = this.ctx.now();
    this.endsAt = this.startedAt + this.seconds * 1000;
    this.guessers = [...this.ctx.players.values()].filter((p) => p.id !== drawer!.id && this.ctx.online(p)).length;
    this.sendWord();
    this.emit("redraw");
    this.ctx.touch();
  }

  private sendWord() {
    this.ctx.send(this.drawerId, { t: "word", word: this.display, round: this.round, rerolls: this.rerolls });
  }

  private emit(ev: "stroke" | "redraw", s?: Stroke, pts?: [number, number][]) {
    this.listeners.forEach((l) => l(ev, s, pts));
  }

  private hint(): string {
    return [...this.display].map((ch, i) => (this.hintMask[i] ? ch : "_")).join(" ");
  }

  private revealLetter() {
    const hidden = this.hintMask.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
    if (hidden.length <= 1) return;
    this.hintMask[hidden[Math.floor(Math.random() * hidden.length)]] = true;
    this.hintsGiven++;
    this.ctx.touch();
  }

  private endRound() {
    if (this.stage !== "draw") return;
    this.stage = "reveal";
    this.revealUntil = this.ctx.now() + this.revealMs;
    const n = this.solved.size;
    if (n > 0) this.ctx.award(this.drawerId, Math.min(300, 40 * n));
    this.ctx.syncScores();
    this.ctx.touch();
  }

  onMsg(p: Player, m: any): void {
    if (this.stage !== "draw") return;
    const isDrawer = p.id === this.drawerId;
    switch (m.t) {
      case "guess": {
        if (isDrawer || this.solved.has(p.id)) return;
        const text = String(m.text ?? "").slice(0, 40);
        if (!text.trim()) return;
        const ok = this.accepted.includes(normalizeGuess(text));
        if (ok) {
          const remaining = Math.max(0, this.endsAt - this.ctx.now());
          const pts = 50 + Math.round((150 * remaining) / (this.seconds * 1000));
          this.solved.set(p.id, pts);
          this.solveOrder.push(p.id);
          this.ctx.award(p.id, pts);
          this.ctx.send(p.id, { t: "guessOk", points: pts });
          this.feed.push({ name: p.name, text: "", ok: true, at: this.ctx.now() });
          if (this.guessers > 0 && this.solved.size >= Math.ceil(this.guessers * 0.9)) this.endRound();
        } else {
          this.feed.push({ name: p.name, text, ok: false, at: this.ctx.now() });
        }
        if (this.feed.length > 40) this.feed.splice(0, this.feed.length - 40);
        this.ctx.touch();
        break;
      }
      case "stroke": {
        if (!isDrawer) return;
        const pts = (m.pts as [number, number][]).slice(0, 80).map(([x, y]) => [clamp01(x), clamp01(y)] as [number, number]);
        if (!pts.length) return;
        let s = this.strokes.find((x) => x.sid === m.sid);
        if (!s) {
          s = { sid: m.sid, c: String(m.c).slice(0, 9), w: Math.max(1, Math.min(40, Number(m.w) || 4)), pts: [] };
          this.strokes.push(s);
        }
        s.pts.push(...pts);
        this.emit("stroke", s, pts);
        break;
      }
      case "clear":
        if (!isDrawer) return;
        this.strokes = [];
        this.emit("redraw");
        break;
      case "undo":
        if (!isDrawer) return;
        this.strokes.pop();
        this.emit("redraw");
        break;
      case "reroll":
        if (!isDrawer || this.rerolls <= 0 || this.solved.size > 0) return;
        this.rerolls--;
        this.nextWord();
        this.sendWord();
        this.ctx.touch();
        break;
    }
  }

  onJoin(p: Player) {
    if (p.id === this.drawerId && this.stage === "draw") this.sendWord();
  }

  tick(now: number): void {
    if (this.stage === "draw") {
      const total = this.endsAt - this.startedAt;
      const elapsed = now - this.startedAt;
      if (this.hintsGiven < 1 && elapsed > total * 0.5) this.revealLetter();
      if (this.hintsGiven < 2 && elapsed > total * 0.75) this.revealLetter();
      if (now >= this.endsAt) this.endRound();
    } else if (this.stage === "reveal" && now >= this.revealUntil) {
      this.nextRound();
    }
  }

  stop(): void {
    this.listeners.clear();
  }

  pub(): DrawPub {
    const drawer = this.ctx.players.get(this.drawerId);
    return {
      stage: this.stage,
      round: this.round,
      rounds: this.rounds,
      drawerId: this.drawerId,
      drawerName: drawer?.name ?? "",
      hint: this.stage === "draw" ? this.hint() : "",
      startedAt: this.startedAt,
      endsAt: this.endsAt,
      solvedCount: this.solved.size,
      guessers: this.guessers,
      solvers: this.solveOrder.slice(0, 12).map((id) => this.ctx.players.get(id)?.name ?? "?"),
      word: this.stage === "reveal" ? this.display : undefined
    };
  }
}

function clamp01(n: number) {
  n = Number(n);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
