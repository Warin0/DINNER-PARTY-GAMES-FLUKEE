import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { HostEngine } from "../../engine/host";
import { UnauthorizedError, createTransport } from "../../lib/transport";
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
  const [needLogin, setNeedLogin] = useState(false);
  const [wrong, setWrong] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pw, setPw] = useState("");
  const starting = useRef(false);
  const roomRef = useRef("");

  const start = async (password?: string) => {
    if (starting.current) return;
    starting.current = true;
    setBusy(true);
    let room = sessionStorage.getItem("opl-host-room");
    if (!room) {
      room = randomRoom();
      sessionStorage.setItem("opl-host-room", room);
    }
    roomRef.current = room;
    try {
      const tr = await createTransport({ role: "host", room, password });
      if (password) sessionStorage.setItem("opl-host-pw", password);
      setMode(tr.mode);
      setEngine(new HostEngine(tr, room));
      setNeedLogin(false);
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        sessionStorage.removeItem("opl-host-pw");
        setWrong(!!password);
        setNeedLogin(true);
      }
    } finally {
      starting.current = false;
      setBusy(false);
    }
  };

  useEffect(() => {
    void start(sessionStorage.getItem("opl-host-pw") || undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (engine) return <HostScreen engine={engine} mode={mode} />;

  if (needLogin) {
    return (
      <div className="page center">
        <h1 className="logo">🔒 Host login</h1>
        <form className="card stack" onSubmit={(e) => { e.preventDefault(); void start(pw); }}>
          <label className="muted">Host password</label>
          <input className="input" type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
          {wrong && <div className="warn" style={{ borderRadius: 10 }}>Wrong password</div>}
          <button className="btn big" disabled={!pw || busy} type="submit">{busy ? "Checking…" : "Start hosting"}</button>
        </form>
      </div>
    );
  }
  return <div className="page center"><h1>Starting…</h1></div>;
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
