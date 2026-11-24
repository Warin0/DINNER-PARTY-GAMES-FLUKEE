import type { GameId, PrivMsg } from "../lib/protocol";

export interface Player {
  id: string;
  name: string;
  color: string;
  score: number;
  ready: boolean;
  lastSeen: number;
}

export interface GameCtx {
  players: Map<string, Player>;
  now(): number;
  send(id: string, msg: PrivMsg): void;
  award(id: string, pts: number): void;
  touch(): void;
  /** push personal score + rank to all phones */
  syncScores(): void;
  /** connected = heard from within the last 45 s */
  online(p: Player): boolean;
}

export interface Game {
  id: GameId;
  pub(): any;
  /** minimum ms between public state snapshots while this game runs (keeps fan-out low) */
  minPubMs?: number;
  onMsg(p: Player, m: any): void;
  onJoin?(p: Player): void;
  tick(now: number): void;
  stop(): void;
}
