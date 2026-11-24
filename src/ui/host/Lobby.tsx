import { useState } from "react";
import type { HostEngine } from "../../engine/host";
import { Scoreboard } from "./Scoreboard";

export function Lobby({ engine, qr, joinUrl }: { engine: HostEngine; qr: string; joinUrl: string }) {
  const players = [...engine.players.values()];
  const ready = players.filter((p) => p.ready).length;

  const [rounds, setRounds] = useState(8);
  const [seconds, setSeconds] = useState(60);
  const [lang, setLang] = useState<"en" | "th">("th");
  const [interval, setIntervalSec] = useState(6);
  const [pattern, setPattern] = useState<"line" | "full">("line");
  const [target, setTarget] = useState(120);
  const [raceSecs, setRaceSecs] = useState(45);

  return (
    <div className="lobby">
      <section className="card joincard">
        <h2>Scan to join</h2>
        {qr && <img src={qr} alt="QR" className="qr" />}
        <div className="bigcode">{engine.room}</div>
        <div className="muted small">{joinUrl.replace(/^https?:\/\//, "")}</div>
      </section>

      <section className="card roster">
        <h2>
          Players <span className="pill">{players.length}</span> <span className="pill ok">✋ {ready} ready</span>
        </h2>
        <div className="chips">
          {players.length === 0 && <p className="muted">Waiting for players to scan the code…</p>}
          {players.map((p) => (
            <span
              key={p.id}
              className={"chip" + (p.ready ? " ready" : "") + (engine.ctx.online(p) ? "" : " off")}
              style={{ borderColor: p.color }}
              title="click to remove"
              onClick={() => confirm(`Remove ${p.name}?`) && engine.kick(p.id)}
            >
              <i style={{ background: p.color }} />
              {p.name}
            </span>
          ))}
        </div>
      </section>

      <section className="games">
        <div className="card game">
          <h3>🎨 Draw &amp; Guess</h3>
          <p className="muted small">A random <b>ready</b> player draws a secret word on their phone. Everyone else types guesses.</p>
          <div className="fields">
            <label>Rounds<input type="number" min={1} max={40} value={rounds} onChange={(e) => setRounds(+e.target.value)} /></label>
            <label>Seconds<input type="number" min={20} max={180} value={seconds} onChange={(e) => setSeconds(+e.target.value)} /></label>
            <label>Words
              <select value={lang} onChange={(e) => setLang(e.target.value as "en" | "th")}>
                <option value="th">ไทย (+English)</option>
                <option value="en">English</option>
              </select>
            </label>
          </div>
          <button className="btn big" disabled={ready < 1} onClick={() => engine.startGame({ game: "draw", opts: { rounds, seconds, lang } })}>
            Start drawing {ready < 1 && "(need a ready player)"}
          </button>
        </div>

        <div className="card game">
          <h3>🎱 Bingo</h3>
          <p className="muted small">Every phone gets its own card. Numbers are called automatically — tap to mark, shout BINGO!</p>
          <div className="fields">
            <label>Seconds / number<input type="number" min={2} max={20} value={interval} onChange={(e) => setIntervalSec(+e.target.value)} /></label>
            <label>Win by
              <select value={pattern} onChange={(e) => setPattern(e.target.value as "line" | "full")}>
                <option value="line">Any line</option>
                <option value="full">Full card</option>
              </select>
            </label>
          </div>
          <button className="btn big" disabled={players.length < 1} onClick={() => engine.startGame({ game: "bingo", opts: { intervalMs: interval * 1000, pattern } })}>
            Start bingo
          </button>
        </div>

        <div className="card game">
          <h3>🏃 Finger Race</h3>
          <p className="muted small">Alternate your thumbs left-right-left-right as fast as you can. First to the finish wins.</p>
          <div className="fields">
            <label>Steps to finish<input type="number" min={30} max={400} value={target} onChange={(e) => setTarget(+e.target.value)} /></label>
            <label>Time limit (s)<input type="number" min={15} max={120} value={raceSecs} onChange={(e) => setRaceSecs(+e.target.value)} /></label>
          </div>
          <button className="btn big" disabled={players.length < 1} onClick={() => engine.startGame({ game: "race", opts: { target, seconds: raceSecs } })}>
            Start race
          </button>
        </div>
      </section>

      <section className="lobby-scores"><Scoreboard engine={engine} /></section>
    </div>
  );
}
