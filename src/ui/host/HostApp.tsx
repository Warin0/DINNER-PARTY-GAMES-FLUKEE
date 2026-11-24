import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { HostEngine } from "../../engine/host";
import { createTransport } from "../../lib/transport";
import { randomRoom, useTicker } from "../hooks";
import { Lobby } from "./Lobby";
import { DrawHost } from "./DrawHost";
import { BingoHost } from "./BingoHost";
import { RaceHost } from "./RaceHost";
import { Scoreboard } from "./Scoreboard";
import type { DrawGame } from "../../engine/draw";
import type { BingoGame } from "../../engine/bingo";
import type { RaceGame } from "../../engine/race";

export function HostApp() {
  const [engine, setEngine] = useState<HostEngine | null>(null);
  const [mode, setMode] = useState<string>("");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let room = sessionStorage.getItem("opl-host-room");
    if (!room) {
      room = randomRoom();
      sessionStorage.setItem("opl-host-room", room);
    }
    createTransport("host-" + room).then((tr) => {
      setMode(tr.mode);
      setEngine(new HostEngine(tr, room!));
    });
  }, []);

  if (!engine) return <div className="page center"><h1>Starting…</h1></div>;
  return <HostScreen engine={engine} mode={mode} />;
}

function HostScreen({ engine, mode }: { engine: HostEngine; mode: string }) {
  useTicker(200);
  const [qr, setQr] = useState("");
  const [showScores, setShowScores] = useState(false);
  const joinUrl = `${location.origin}/play?room=${engine.room}${mode === "local" ? "&local=1" : ""}`;
  useEffect(() => {
    QRCode.toDataURL(joinUrl, { margin: 1, width: 360, color: { dark: "#14102b", light: "#ffffff" } }).then(setQr);
  }, [joinUrl]);

  const all = [...engine.players.values()];
  const online = all.filter((p) => engine.ctx.online(p)).length;
  const g = engine.game;

  return (
    <div className="host">
      <header className="hostbar">
        <div className="room">
          <span className="muted">Room</span> <b>{engine.room}</b>
        </div>
        <div className="muted small joinurl">{joinUrl.replace(/^https?:\/\//, "")}</div>
        <div className="spacer" />
        <div className="pill">👥 {online}/{all.length} online</div>
        <button className="btn ghost" onClick={() => setShowScores((s) => !s)}>🏆 Scores</button>
        {engine.phase === "game" && (
          <button className="btn ghost" onClick={() => engine.endGame()}>⏹ Back to lobby</button>
        )}
      </header>

      {mode === "local" && (
        <div className="warn">
          Demo mode: realtime service not configured, so only tabs in this same browser can join. Set <code>ABLY_API_KEY</code> on Vercel for real phones.
        </div>
      )}

      {showScores && <Scoreboard engine={engine} onClose={() => setShowScores(false)} />}

      {engine.phase === "lobby" && <Lobby engine={engine} qr={qr} joinUrl={joinUrl} />}
      {engine.phase === "game" && g?.id === "draw" && <DrawHost engine={engine} game={g as DrawGame} />}
      {engine.phase === "game" && g?.id === "bingo" && <BingoHost engine={engine} game={g as BingoGame} />}
      {engine.phase === "game" && g?.id === "race" && <RaceHost engine={engine} game={g as RaceGame} />}
    </div>
  );
}
