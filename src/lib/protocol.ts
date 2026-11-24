// Shared message contracts and channel naming.
// Channels:
//   opl:<room>:state       host -> everyone      (low-rate public snapshot)
//   opl:<room>:in:<0..7>   players -> host       (sharded so no channel exceeds ~50 msg/s)
//   opl:<room>:p:<id>      host -> one player    (private: word, bingo card, results)

export type GameId = "draw" | "bingo" | "race";
export const SHARDS = 8;

export function shard(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % SHARDS;
}

export const channels = {
  state: (room: string) => `opl:${room}:state`,
  inboxFor: (room: string, id: string) => `opl:${room}:in:${shard(id)}`,
  inbox: (room: string, n: number) => `opl:${room}:in:${n}`,
  priv: (room: string, id: string) => `opl:${room}:p:${id}`
};

// ---------- public state (host -> all phones) ----------
export interface DrawPub {
  stage: "draw" | "reveal" | "over";
  round: number;
  rounds: number;
  drawerId: string;
  drawerName: string;
  hint: string;
  startedAt: number;
  endsAt: number;
  solvedCount: number;
  guessers: number;
  solvers: string[];
  word?: string;
}
export interface BingoPub {
  stage: "running" | "over";
  pattern: "line" | "full";
  called: number[];
  intervalMs: number;
  nextAt: number;
  winners: { name: string; place: number }[];
}
export interface RacePub {
  stage: "countdown" | "run" | "over";
  startAt: number;
  endsAt: number;
  target: number;
  finishers: string[];
}
export interface PubState {
  t: "state";
  now: number;
  rev: number;
  room: string;
  phase: "lobby" | "game";
  game?: GameId;
  counts: { joined: number; ready: number; online: number };
  top: { name: string; score: number }[];
  g?: DrawPub | BingoPub | RacePub;
}

// ---------- private host -> player ----------
export type PrivMsg =
  | { t: "welcome"; id: string; name: string; color: string; score: number; ready: boolean }
  | { t: "me"; score: number; ready: boolean; rank: number }
  | { t: "word"; word: string; round: number; rerolls: number }
  | { t: "card"; card: number[][] }
  | { t: "guessOk"; points: number }
  | { t: "claimResult"; ok: boolean; place?: number; msg: string; lockMs?: number }
  | { t: "unknown" };

// ---------- player -> host ----------
export type InMsg =
  | { t: "join"; id: string; name: string }
  | { t: "hello"; id: string }
  | { t: "ready"; id: string; ready: boolean }
  | { t: "guess"; id: string; text: string }
  | { t: "stroke"; id: string; sid: number; c: string; w: number; pts: [number, number][] }
  | { t: "clear"; id: string }
  | { t: "undo"; id: string }
  | { t: "reroll"; id: string }
  | { t: "claim"; id: string }
  | { t: "steps"; id: string; n: number };

export const COLORS = [
  "#ff5d73", "#ff9f43", "#feca57", "#1dd1a1", "#48dbfb", "#54a0ff",
  "#5f27cd", "#c56cf0", "#ff6bd6", "#00d2d3", "#ee5a24", "#9ade4b"
];
