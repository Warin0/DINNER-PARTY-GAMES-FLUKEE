import { useEffect, useRef, useState } from "react";
import type { PlayerClient } from "../../lib/client";
import type { DrawPub } from "../../lib/protocol";
import { fmtSecs, useTicker } from "../hooks";

const PALETTE = ["#111111", "#e74c3c", "#ff9f43", "#f1c40f", "#2ecc71", "#3498db", "#8e44ad", "#8d5524", "#ffffff"];

export function DrawPlayer({ client }: { client: PlayerClient }) {
  useTicker(250);
  const v = client.view;
  const g = v.state!.g as DrawPub;
  const isDrawer = g.drawerId === client.id;
  const left = g.endsAt - client.now();

  const rr = v.roundResult && v.roundResult.sid === g.sid ? v.roundResult : undefined;

  if (g.stage === "over") {
    const final = rr && rr.final ? rr : undefined;
    return (
      <div className="center-block">
        <h2>🏁 Final results</h2>
        {final ? (
          <>
            <div className="bigrank">#{final.rank}<small> of {final.players}</small></div>
            <div className="bigtotal">{final.total} <small>points</small></div>
            <div className="perround">
              {final.perRound.map((pts, i) => (
                <div key={i} className={"pr" + (pts ? "" : " zero")}><small>R{i + 1}</small><b>{pts || "–"}</b></div>
              ))}
            </div>
          </>
        ) : (
          <p>Your drawing score: <b>{v.score}</b></p>
        )}
        {g.board && (
          <ol className="podium tight phoneboard">
            {g.board.slice(0, 5).map((b, i) => (
              <li key={i}><span className="rank">{["🥇", "🥈", "🥉", "4", "5"][i]}</span><span className="grow">{b.name}</span><b>{b.total}</b></li>
            ))}
          </ol>
        )}
        <p className="muted small">Full table on the big screen!</p>
      </div>
    );
  }
  if (g.stage === "reveal") {
    return (
      <div className="center-block">
        <h2>The word was</h2>
        <div className="reveal">{g.word}</div>
        {rr && rr.round === g.round ? (
          <>
            <div className={"gainbox" + (rr.points ? "" : " none")}>
              {rr.points ? `+${rr.points}` : "+0"}
              <small>
                {rr.drawer ? "for your drawing" : rr.ms ? `guessed in ${(rr.ms / 1000).toFixed(1)}s` : "no guess this round"}
              </small>
            </div>
            <p>Total <b>{rr.total}</b> · Rank <b>#{rr.rank}</b> of {rr.players}</p>
          </>
        ) : (
          <p className="muted">{g.solvedCount} player{g.solvedCount === 1 ? "" : "s"} guessed it</p>
        )}
        <p className="muted small">{g.round < g.rounds ? `Round ${g.round + 1} of ${g.rounds} coming up…` : "Final results next…"}</p>
      </div>
    );
  }
  return isDrawer ? <Pad client={client} g={g} left={left} /> : <Guess client={client} g={g} left={left} />;
}

function Guess({ client, g, left }: { client: PlayerClient; g: DrawPub; left: number }) {
  const [text, setText] = useState("");
  const [lastSent, setLastSent] = useState(0);
  const v = client.view;
  const solved = !!v.lastGuessPoints && v.lastGuessPoints.at >= g.startedAt - v.offset - 1500;
  const [cooldown, setCooldown] = useState(false);

  const send = () => {
    const t = text.trim();
    if (!t || cooldown) return;
    client.guess(t);
    setLastSent(Date.now());
    setText("");
    setCooldown(true);
    setTimeout(() => setCooldown(false), 1200); // keeps total traffic low with 80 guessers
  };

  return (
    <div className="guess">
      <div className="timer big">{fmtSecs(left)}s</div>
      <p className="muted"><b>{g.drawerName}</b> is drawing — look at the big screen!</p>
      <p className="muted small">⚡ Guess fast: up to {Math.round(100 + 400 * Math.max(0, Math.min(1, left / Math.max(1, g.endsAt - g.startedAt))))} points right now</p>
      <div className="hint">{g.hint}</div>
      {solved ? (
        <div className="solved">✅ Correct! +{v.lastGuessPoints!.points}<br /><small>Wait for the others…</small></div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); send(); }} className="stack">
          <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Type your guess…" autoComplete="off" autoCorrect="off" autoCapitalize="none" />
          <button className="btn big" disabled={!text.trim() || cooldown} type="submit">{cooldown ? "…" : "Guess!"}</button>
          {lastSent > 0 && <small className="muted">Keep guessing — wrong answers are free.</small>}
        </form>
      )}
    </div>
  );
}

interface LocalStroke { c: string; w: number; pts: [number, number][] }

function Pad({ client, g, left }: { client: PlayerClient; g: DrawPub; left: number }) {
  const v = client.view;
  const ref = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<LocalStroke[]>([]);
  const cur = useRef<{ s: LocalStroke; sid: number; sent: number } | null>(null);
  const [color, setColor] = useState(PALETTE[0]);
  const [size, setSize] = useState(5);
  const colorRef = useRef(color); colorRef.current = color;
  const sizeRef = useRef(size); sizeRef.current = size;

  const W = 640, H = 480;
  const redraw = () => {
    const ctx = ref.current!.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, W, H);
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (const s of strokes.current) {
      ctx.strokeStyle = s.c; ctx.fillStyle = s.c; ctx.lineWidth = s.w * 1.6;
      if (s.pts.length === 1) { ctx.beginPath(); ctx.arc(s.pts[0][0] * W, s.pts[0][1] * H, ctx.lineWidth / 2, 0, 7); ctx.fill(); continue; }
      ctx.beginPath(); ctx.moveTo(s.pts[0][0] * W, s.pts[0][1] * H);
      s.pts.slice(1).forEach(([x, y]) => ctx.lineTo(x * W, y * H));
      ctx.stroke();
    }
  };

  // reset the pad when the round changes
  useEffect(() => { strokes.current = []; redraw(); }, [g.round]);

  // flush buffered points ~12x per second
  useEffect(() => {
    const t = setInterval(() => {
      const c = cur.current;
      if (!c || c.s.pts.length <= c.sent) return;
      const from = Math.max(0, c.sent - 1);
      client.stroke(c.s.c, c.s.w, c.s.pts.slice(from).map(([x, y]) => [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000] as [number, number]), c.sid);
      c.sent = c.s.pts.length;
    }, 80);
    return () => clearInterval(t);
  }, [client]);

  const pos = (e: React.PointerEvent): [number, number] => {
    const r = ref.current!.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
  };
  const down = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    const s: LocalStroke = { c: colorRef.current, w: sizeRef.current, pts: [pos(e)] };
    strokes.current.push(s);
    cur.current = { s, sid: client.newStrokeId(), sent: 0 };
    redraw();
  };
  const move = (e: React.PointerEvent) => {
    const c = cur.current;
    if (!c) return;
    c.s.pts.push(pos(e));
    redraw();
  };
  const up = () => {
    const c = cur.current;
    if (c && c.s.pts.length > c.sent) {
      client.stroke(c.s.c, c.s.w, c.s.pts.slice(Math.max(0, c.sent - 1)), c.sid);
      c.sent = c.s.pts.length;
    }
    cur.current = null;
  };

  return (
    <div className="pad">
      <div className="padtop">
        <div className="wordbox">Draw: <b>{v.word ? v.word.word : "…"}</b></div>
        <div className="timer">{fmtSecs(left)}s</div>
      </div>
      <canvas ref={ref} width={W} height={H} className="padcanvas" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
      <div className="palette">
        {PALETTE.map((c) => (
          <button key={c} className={"sw" + (c === color ? " sel" : "")} style={{ background: c }} onClick={() => setColor(c)} aria-label={c} />
        ))}
      </div>
      <div className="row tools">
        {[3, 6, 12].map((s) => <button key={s} className={"btn small" + (s === size ? " on" : "")} onClick={() => setSize(s)}>{s === 3 ? "•" : s === 6 ? "●" : "⬤"}</button>)}
        <button className="btn small" onClick={() => { strokes.current.pop(); redraw(); client.undo(); }}>↩ Undo</button>
        <button className="btn small" onClick={() => { strokes.current = []; redraw(); client.clear(); }}>🗑</button>
        {(v.word?.rerolls ?? 0) > 0 && g.solvedCount === 0 && <button className="btn small" onClick={() => client.reroll()}>🎲 New word</button>}
      </div>
      <p className="muted small">Don't write the word! Guessers can see your drawing on the big screen.</p>
    </div>
  );
}
