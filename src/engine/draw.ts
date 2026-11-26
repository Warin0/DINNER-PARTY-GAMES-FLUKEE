import type { DrawPub } from "../lib/protocol";
import { WORDS, emojiFor, normalizeGuess, parseEntry, shuffle } from "../lib/words";
import type { Game, GameCtx, Player } from "./types";

export interface DrawOptions {
  rounds: number;
  seconds: number;
  revealMs?: number;
  /** how long the drawer may study the word + picture before the clock starts anyway (0 = start at once) */
  prepMs?: number;
  /** host-supplied words ("word" or "word|alt|alt") */
  customWords?: string[];
  /** use only the host's words (needs at least one) */
  customOnly?: boolean;
  /** pictures for the host's words, keyed by normalizeGuess(display word); data URLs, ~40 KB max each */
  images?: Record<string, string>;
}

export interface RoundSummary {
  round: number;
  drawerId: string;
  drawerName: string;
  word: string;
  solvers: { id: string; name: string; ms: number; points: number }[];
  drawerPoints: number;
}

/** Scoring: every correct guess is worth BASE + up to SPEED_MAX depending on how much time was left. */
export const BASE_POINTS = 100;
export const SPEED_MAX = 400;
export const DRAWER_PER_SOLVER = 50;
export const DRAWER_MAX = 400;
export const DEFAULT_PREP_MS = 20_000;

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
  prepMs: number;

  private queue: string[];
  private words: string[];
  private custom: string[];
  private customOnly: boolean;
  private drawerId = "";
  private display = "";
  private emoji?: string;
  private img?: string;
  private images: Record<string, string>;
  private prepUntil = 0;
  private accepted: string[] = [];
  private hintMask: boolean[] = [];
  private hintsGiven = 0;
  private startedAt = 0;
  private endsAt = 0;
  private revealUntil = 0;
  private rerolls = 1;
  private solved = new Map<string, number>(); // id -> points
  private solveOrder: string[] = [];
  private solveMs = new Map<string, number>();
  private guessers = 0;

  /** unique per drawing session */
  sid = Math.random().toString(36).slice(2, 10);
  /** per-round results, oldest first (host-only view) */
  history: RoundSummary[] = [];
  /** points per player for each finished round: perRound.get(id)[round-1] */
  private perRound = new Map<string, number[]>();

  // host-only view
  strokes: Stroke[] = [];
  feed: FeedItem[] = [];
  listeners = new Set<(ev: "stroke" | "redraw", s?: Stroke, pts?: [number, number][]) => void>();

  constructor(private ctx: GameCtx, opts: DrawOptions) {
    this.seconds = opts.seconds;
    this.revealMs = opts.revealMs ?? 6000;
    this.prepMs = Math.max(0, opts.prepMs ?? DEFAULT_PREP_MS);
    this.images = opts.images ?? {};
    const ready = [...ctx.players.values()].filter((p) => p.ready);
    this.queue = shuffle(ready.map((p) => p.id));
    this.rounds = Math.max(1, Math.min(opts.rounds, this.queue.length || 1));
    this.custom = (opts.customWords ?? []).filter(Boolean);
    this.customOnly = !!opts.customOnly && this.custom.length > 0;
    this.words = this.pool();
    this.nextRound();
  }

  private pool(): string[] {
    return shuffle(this.customOnly ? this.custom : [...this.custom, ...WORDS]);
  }

  private nextWord(): void {
    if (this.words.length === 0) this.words = this.pool();
    const entry = parseEntry(this.words.pop()!);
    this.display = entry.display;
    this.accepted = entry.accepted;
    this.img = this.images[normalizeGuess(entry.display)];
    this.emoji = emojiFor(entry.display);
    this.hintMask = [...entry.display].map((ch) => /[\s\p{P}\p{S}]/u.test(ch));
    this.hintsGiven = 0;
  }

  private pickDrawer(avoid?: string): Player | undefined {
    const take = () => {
      while (this.queue.length) {
        const cand = this.ctx.players.get(this.queue.shift()!);
        if (cand && cand.id !== avoid && this.ctx.online(cand) && cand.ready) return cand;
      }
      return undefined;
    };
    let d = take();
    if (!d && this.round < this.rounds) {
      // everyone queued has drawn (or was skipped): start another lap, preferring someone other than the last drawer
      const eligible = [...this.ctx.players.values()].filter((p) => p.ready && this.ctx.online(p));
      const others = eligible.filter((p) => p.id !== avoid && p.id !== this.drawerId);
      this.queue = shuffle((others.length ? others : eligible.filter((p) => p.id !== avoid)).map((p) => p.id));
      d = take();
    }
    return d;
  }

  private nextRound(avoid?: string) {
    // drawer = next random ready player who is still around
    const drawer = this.pickDrawer(avoid);
    if (!drawer || this.round >= this.rounds) {
      this.stage = "over";
      if (this.history.length) this.sendRoundResults(true);
      this.ctx.touch();
      return;
    }
    this.round++;
    this.stage = "prep";
    this.drawerId = drawer.id;
    this.rerolls = 1;
    this.solved.clear();
    this.solveOrder = [];
    this.solveMs.clear();
    this.strokes = [];
    this.feed = [];
    this.nextWord();
    this.startedAt = 0;
    this.endsAt = 0;
    this.prepUntil = this.ctx.now() + this.prepMs;
    this.sendWord();
    this.emit("redraw");
    if (this.prepMs <= 0) this.beginDrawing();
    else this.ctx.touch(true);
  }

  /** the drawer pressed "I'm ready" (or prep ran out): hide the picture and start the clock */
  private beginDrawing() {
    if (this.stage !== "prep") return;
    this.stage = "draw";
    this.startedAt = this.ctx.now();
    this.endsAt = this.startedAt + this.seconds * 1000;
    this.guessers = [...this.ctx.players.values()].filter((p) => p.id !== this.drawerId && this.ctx.online(p)).length;
    this.ctx.touch(true);
  }

  /** award points globally AND record them for this session's round table */
  private gain(id: string, pts: number) {
    if (pts <= 0) return;
    this.ctx.award(id, pts);
    const arr = this.perRound.get(id) ?? [];
    while (arr.length < this.round) arr.push(0);
    arr[this.round - 1] += pts;
    this.perRound.set(id, arr);
  }

  private fastestOf(id: string): number {
    let best = Infinity;
    for (const h of this.history) for (const s of h.solvers) if (s.id === id) best = Math.min(best, s.ms);
    return best;
  }

  perRoundOf(id: string): number[] {
    const arr = (this.perRound.get(id) ?? []).slice();
    while (arr.length < this.history.length) arr.push(0);
    return arr;
  }

  totalOf(id: string): number {
    return (this.perRound.get(id) ?? []).reduce((a, b) => a + b, 0);
  }

  /** session standings (everyone who joined; ties broken by fastest single guess, then name) */
  sessionRanking() {
    return [...this.ctx.players.values()]
      .map((p) => ({ id: p.id, name: p.name, color: p.color, total: this.totalOf(p.id), fastest: this.fastestOf(p.id) }))
      .sort((a, b) => b.total - a.total || a.fastest - b.fastest || a.name.localeCompare(b.name));
  }

  private sendRoundResults(final: boolean) {
    const ranking = this.sessionRanking();
    const last = this.history[this.history.length - 1];
    ranking.forEach((r, i) => {
      const per = this.perRoundOf(r.id);
      const sol = last?.solvers.find((s) => s.id === r.id);
      const isDrawer = last?.drawerId === r.id;
      this.ctx.send(r.id, {
        t: "roundResult",
        sid: this.sid,
        round: last?.round ?? this.round,
        rounds: this.rounds,
        points: isDrawer ? last.drawerPoints : sol?.points ?? 0,
        ms: sol?.ms ?? 0,
        drawer: isDrawer,
        total: r.total,
        rank: i + 1,
        players: ranking.length,
        perRound: per,
        final
      });
    });
  }

  /**
   * Host control: replace the current drawer (absent, stuck, uncomfortable...).
   * The round is voided - points already given in it are taken back and it does not count -
   * and the next ready player draws a fresh word with a full timer.
   */
  skipDrawer(): boolean {
    if (this.stage !== "draw" && this.stage !== "prep") return false;
    const skipped = this.ctx.players.get(this.drawerId);
    for (const [id, pts] of this.solved) {
      this.ctx.award(id, -pts);
      const arr = this.perRound.get(id);
      if (arr) arr[this.round - 1] = (arr[this.round - 1] ?? 0) - pts;
    }
    this.round--; // this round never happened
    this.skips++;
    const before = this.round;
    this.nextRound(this.drawerId);
    if (this.stage === "draw" || this.stage === "prep") {
      this.feed.push({ name: "Host", text: `skipped ${skipped?.name ?? "the drawer"} – new drawer!`, ok: false, at: this.ctx.now() });
    } else if (before >= 0 && this.history.length === 0) {
      // nobody left to draw and nothing was played
      this.ctx.touch();
    }
    this.ctx.syncScores();
    this.ctx.touch();
    return true;
  }

  skips = 0;

  private sendWord() {
    this.ctx.send(this.drawerId, { t: "word", word: this.display, round: this.round, rerolls: this.rerolls, emoji: this.emoji, img: this.img });
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
    const drawerPoints = Math.min(DRAWER_MAX, DRAWER_PER_SOLVER * n);
    this.gain(this.drawerId, drawerPoints);
    this.history.push({
      round: this.round,
      drawerId: this.drawerId,
      drawerName: this.ctx.players.get(this.drawerId)?.name ?? "?",
      word: this.display,
      solvers: this.solveOrder.map((id) => ({
        id,
        name: this.ctx.players.get(id)?.name ?? "?",
        ms: this.solveMs.get(id) ?? 0,
        points: this.solved.get(id) ?? 0
      })),
      drawerPoints
    });
    this.ctx.syncScores();
    this.sendRoundResults(this.round >= this.rounds);
    this.ctx.touch(true);
  }

  onMsg(p: Player, m: any): void {
    const isDrawer = p.id === this.drawerId;
    if (this.stage === "prep") {
      if (!isDrawer) return;
      if (m.t === "go") this.beginDrawing();
      else if (m.t === "reroll" && this.rerolls > 0) {
        this.rerolls--;
        this.nextWord();
        this.sendWord();
        this.ctx.touch();
      }
      return;
    }
    if (this.stage !== "draw") return;
    switch (m.t) {
      case "guess": {
        if (isDrawer || this.solved.has(p.id)) return;
        const text = String(m.text ?? "").slice(0, 40);
        if (!text.trim()) return;
        const ok = this.accepted.includes(normalizeGuess(text));
        if (ok) {
          const now = this.ctx.now();
          const remaining = Math.max(0, this.endsAt - now);
          const pts = BASE_POINTS + Math.round((SPEED_MAX * remaining) / (this.seconds * 1000));
          const ms = Math.max(0, now - this.startedAt);
          this.solved.set(p.id, pts);
          this.solveOrder.push(p.id);
          this.solveMs.set(p.id, ms);
          this.gain(p.id, pts);
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
    if (p.id === this.drawerId && (this.stage === "draw" || this.stage === "prep")) this.sendWord();
  }

  tick(now: number): void {
    if (this.stage === "prep") {
      if (now >= this.prepUntil) this.beginDrawing();
    } else if (this.stage === "draw") {
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
      seconds: this.seconds,
      prepMs: this.prepMs,
      prepEndsAt: this.stage === "prep" ? this.prepUntil : undefined,
      emoji: this.stage === "reveal" ? this.emoji : undefined,
      startedAt: this.startedAt,
      endsAt: this.endsAt,
      solvedCount: this.solved.size,
      guessers: this.guessers,
      solvers: this.solveOrder.slice(0, 12).map((id) => this.ctx.players.get(id)?.name ?? "?"),
      word: this.stage === "reveal" ? this.display : undefined,
      sid: this.sid,
      board:
        this.stage === "draw" || this.history.length === 0
          ? undefined
          : this.sessionRanking()
              .slice(0, this.stage === "over" ? 10 : 5)
              .map((r) => ({
                name: r.name,
                total: r.total,
                gain: this.perRoundOf(r.id)[this.history.length - 1] ?? 0
              }))
    };
  }
}

function clamp01(n: number) {
  n = Number(n);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
