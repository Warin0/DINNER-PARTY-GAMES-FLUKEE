import { channels, type InMsg, type PrivMsg, type PubState } from "./protocol";
import type { Transport } from "./transport";

export interface ClientView {
  joined: boolean;
  name: string;
  color: string;
  score: number;
  rank: number;
  ready: boolean;
  state: PubState | null;
  /** host clock minus local clock (ms) */
  offset: number;
  word?: { word: string; round: number; rerolls: number };
  card?: number[][];
  lastGuessPoints?: { points: number; at: number };
  roundResult?: Extract<PrivMsg, { t: "roundResult" }>;
  claim?: { ok: boolean; place?: number; msg: string; lockUntil: number; at: number };
}

/** Phone-side protocol client. Used by the React UI and by the load-test bots. */
export class PlayerClient {
  view: ClientView = {
    joined: false, name: "", color: "#888", score: 0, rank: 0, ready: false,
    state: null, offset: 0
  };
  listeners = new Set<() => void>();
  private unsubs: (() => void)[] = [];
  private hb?: ReturnType<typeof setInterval>;
  private retry?: ReturnType<typeof setInterval>;
  private sid = 0;

  constructor(public tr: Transport, public room: string, public id: string, name: string) {
    this.view.name = name;
    this.unsubs.push(
      tr.subscribe(channels.state(room), (s) => this.onState(s)),
      tr.subscribe(channels.priv(room, id), (m) => this.onPriv(m))
    );
    this.join();
    this.hb = setInterval(() => this.send({ t: "hello", id: this.id }), 15_000);
    // replies can be lost while channels are still attaching, so keep asking until we are welcomed AND have state
    this.retry = setInterval(() => {
      if (!this.view.joined || !this.view.state) this.join();
    }, 3000);
  }

  now() {
    return Date.now() + this.view.offset;
  }

  private emit() {
    this.view = { ...this.view };
    this.listeners.forEach((l) => l());
  }

  private send(m: InMsg) {
    this.tr.publish(channels.inboxFor(this.room, this.id), m);
  }

  private join() {
    this.send({ t: "join", id: this.id, name: this.view.name });
  }

  private onState(s: PubState) {
    if (!s || s.t !== "state") return;
    this.view.offset = s.now - Date.now();
    // Drop only what belonged to the game that just ended. Private messages for the NEXT game can
    // arrive before its public state does, so they must survive a direct game-to-game switch.
    const prev = this.view.state?.game;
    if (!s.game) {
      this.view.card = undefined;
      this.view.word = undefined;
      this.view.claim = undefined;
    } else if (prev && prev !== s.game) {
      if (prev === "bingo") {
        this.view.card = undefined;
        this.view.claim = undefined;
      }
      if (prev === "draw") {
        this.view.word = undefined;
        this.view.roundResult = undefined;
      }
    }
    if (!s.game) this.view.roundResult = undefined;
    const g = s.g as { round?: number } | undefined;
    if (this.view.word && g?.round !== undefined && g.round !== this.view.word.round) this.view.word = undefined;
    this.view.state = s;
    this.emit();
  }

  private onPriv(m: PrivMsg) {
    switch (m.t) {
      case "welcome":
        Object.assign(this.view, { joined: true, name: m.name, color: m.color, score: m.score, ready: m.ready });
        break;
      case "me":
        Object.assign(this.view, { score: m.score, ready: m.ready, rank: m.rank });
        break;
      case "word":
        this.view.word = { word: m.word, round: m.round, rerolls: m.rerolls };
        break;
      case "card":
        this.view.card = m.card;
        break;
      case "roundResult":
        this.view.roundResult = m;
        break;
      case "guessOk":
        this.view.lastGuessPoints = { points: m.points, at: Date.now() };
        break;
      case "claimResult":
        this.view.claim = { ok: m.ok, place: m.place, msg: m.msg, lockUntil: Date.now() + (m.lockMs ?? 0), at: Date.now() };
        break;
      case "unknown":
        this.join();
        return;
    }
    this.emit();
  }

  setReady(ready: boolean) {
    this.view.ready = ready;
    this.emit();
    this.send({ t: "ready", id: this.id, ready });
  }
  guess(text: string) {
    this.send({ t: "guess", id: this.id, text });
  }
  stroke(c: string, w: number, pts: [number, number][], sid: number) {
    this.send({ t: "stroke", id: this.id, sid, c, w, pts });
  }
  newStrokeId() {
    return ++this.sid + Math.floor(Math.random() * 1e6) * 1000;
  }
  clear() {
    this.send({ t: "clear", id: this.id });
  }
  undo() {
    this.send({ t: "undo", id: this.id });
  }
  reroll() {
    this.send({ t: "reroll", id: this.id });
  }
  claim() {
    this.send({ t: "claim", id: this.id });
  }
  steps(n: number) {
    this.send({ t: "steps", id: this.id, n });
  }

  close() {
    clearInterval(this.hb);
    clearInterval(this.retry);
    this.unsubs.forEach((u) => u());
  }
}
