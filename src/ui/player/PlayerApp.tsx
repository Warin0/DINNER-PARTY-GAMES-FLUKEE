import { useEffect, useRef, useState } from "react";
import { PlayerClient } from "../../lib/client";
import { createTransport } from "../../lib/transport";
import { randomId, useSubscribe, useTicker } from "../hooks";
import { DrawPlayer } from "./DrawPlayer";
import { BingoPlayer } from "./BingoPlayer";
import { RacePlayer } from "./RacePlayer";

export function PlayerApp() {
  const params = new URLSearchParams(location.search);
  const room = (params.get("room") || "").toUpperCase();
  const [name, setName] = useState(localStorage.getItem("opl-name") || "");
  const [client, setClient] = useState<PlayerClient | null>(null);
  const [busy, setBusy] = useState(false);
  const rejoined = useRef(false);

  const join = async (n: string) => {
    setBusy(true);
    let id = params.get("pid") || localStorage.getItem(`opl-id-${room}`);
    if (!id) {
      id = randomId();
      localStorage.setItem(`opl-id-${room}`, id);
    }
    localStorage.setItem("opl-name", n);
    if (!params.get("pid")) localStorage.setItem(`opl-id-${room}`, id);
    const tr = await createTransport({ role: "player", room, pid: id });
    setClient(new PlayerClient(tr, room, id, n));
    setBusy(false);
  };

  // returning player (refresh / reconnect) joins straight away with the saved name
  useEffect(() => {
    if (!rejoined.current && room && name && !params.get("pid") && localStorage.getItem(`opl-id-${room}`)) {
      rejoined.current = true;
      void join(name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!room) {
    return (
      <div className="page center">
        <h2>No room code</h2>
        <a className="btn" href="/">Back</a>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="page center">
        <h1 className="logo">🎉 Room {room}</h1>
        <form
          className="card stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) void join(name.trim());
          }}
        >
          <label className="muted">Your name</label>
          <input className="input" value={name} maxLength={16} autoFocus placeholder="e.g. Fluke" onChange={(e) => setName(e.target.value)} />
          <button className="btn big" disabled={!name.trim() || busy} type="submit">Join the party</button>
        </form>
      </div>
    );
  }
  return <Player client={client} />;
}

function Player({ client }: { client: PlayerClient }) {
  const listeners = client.listeners;
  useSubscribe(listeners);
  useTicker(1000);
  const v = client.view;
  const s = v.state;

  return (
    <div className="phone" style={{ ["--me" as any]: v.color }}>
      <header className="phonebar">
        <span className="dot" style={{ background: v.color }} />
        <b className="grow">{v.name}</b>
        <span className="pill">⭐ {v.score}</span>
        {v.rank > 0 && <span className="pill">#{v.rank}</span>}
      </header>

      {!s && (
        <div className="center-block">
          <h2>Connecting…</h2>
          <p className="muted">Waiting for the host screen</p>
          <p className="muted small">Realtime: {client.tr.statusText ?? client.tr.mode}</p>
          <p className="muted small">Make sure the host screen is open on this room ({client.room}).</p>
        </div>
      )}
      {s && !v.joined && <div className="center-block"><h2>Joining…</h2></div>}

      {s && v.joined && s.phase === "lobby" && (
        <div className="center-block">
          <h2>You're in! 🎉</h2>
          <p className="muted">{s.counts.joined} players · {s.counts.ready} ready</p>
          <button className={"btn big " + (v.ready ? "on" : "")} onClick={() => client.setReady(!v.ready)}>
            {v.ready ? "✋ Ready! (tap to undo)" : "I'm ready to draw!"}
          </button>
          <p className="muted small">Ready players can be picked to draw. Everyone can play bingo and race.</p>
        </div>
      )}

      {s && v.joined && s.phase === "game" && s.game === "draw" && <DrawPlayer client={client} />}
      {s && v.joined && s.phase === "game" && s.game === "bingo" && <BingoPlayer client={client} />}
      {s && v.joined && s.phase === "game" && s.game === "race" && <RacePlayer client={client} />}
    </div>
  );
}
