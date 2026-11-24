import { useEffect, useRef } from "react";
import type { HostEngine } from "../../engine/host";
import type { DrawGame, Stroke } from "../../engine/draw";
import { fmtSecs } from "../hooks";

const W = 960;
const H = 720;

function paint(ctx: CanvasRenderingContext2D, s: Stroke, from = 0) {
  ctx.strokeStyle = s.c;
  ctx.fillStyle = s.c;
  ctx.lineWidth = s.w * 2.4;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const pts = s.pts;
  if (pts.length === 1 && from === 0) {
    ctx.beginPath();
    ctx.arc(pts[0][0] * W, pts[0][1] * H, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  const start = Math.max(0, from);
  ctx.moveTo(pts[start][0] * W, pts[start][1] * H);
  for (let i = start + 1; i < pts.length; i++) ctx.lineTo(pts[i][0] * W, pts[i][1] * H);
  ctx.stroke();
}

function Canvas({ game }: { game: DrawGame }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext("2d")!;
    const redraw = () => {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, W, H);
      game.strokes.forEach((s) => paint(ctx, s));
    };
    redraw();
    const l = (ev: string, s?: Stroke, pts?: [number, number][]) => {
      if (ev === "redraw") return redraw();
      if (ev === "stroke" && s && pts) paint(ctx, s, Math.max(0, s.pts.length - pts.length - 1));
    };
    game.listeners.add(l);
    return () => void game.listeners.delete(l);
  }, [game]);
  return <canvas ref={ref} width={W} height={H} className="hostcanvas" />;
}

export function DrawHost({ engine, game }: { engine: HostEngine; game: DrawGame }) {
  const pub = game.pub();
  const now = Date.now();
  const total = Math.max(1, pub.endsAt - pub.startedAt);
  const left = pub.endsAt - now;

  if (pub.stage === "over") {
    return (
      <div className="center-block">
        <h1>🎨 Drawing finished!</h1>
        <Top engine={engine} />
        <button className="btn big" onClick={() => engine.endGame()}>Back to lobby</button>
      </div>
    );
  }

  return (
    <div className="drawhost">
      <div className="drawmain">
        <div className="drawtop">
          <span className="pill">Round {pub.round}/{pub.rounds}</span>
          <span className="drawer">✏️ <b>{pub.drawerName}</b> is drawing</span>
          <span className="spacer" />
          {pub.stage === "draw" && <span className="timer">{fmtSecs(left)}s</span>}
        </div>
        {pub.stage === "draw" && (
          <div className="bar"><i style={{ width: `${Math.max(0, Math.min(100, (left / total) * 100))}%` }} /></div>
        )}
        <div className="hint">
          {pub.stage === "draw" ? pub.hint : <>The word was <b>{pub.word}</b></>}
        </div>
        <Canvas game={game} />
      </div>
      <aside className="drawside">
        <div className="card">
          <h3>✅ Guessed it ({pub.solvedCount}/{pub.guessers})</h3>
          <div className="chips">
            {pub.solvers.map((n, i) => <span key={i} className="chip ready">{n}</span>)}
            {pub.solvers.length === 0 && <span className="muted small">Nobody yet…</span>}
          </div>
        </div>
        <div className="card feed">
          <h3>💬 Guesses</h3>
          {[...game.feed].reverse().slice(0, 14).map((f, i) => (
            <div key={f.at + "-" + i} className={"fitem" + (f.ok ? " ok" : "")}>
              <b>{f.name}</b> {f.ok ? "got it! 🎉" : f.text}
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}

function Top({ engine }: { engine: HostEngine }) {
  return (
    <ol className="podium">
      {engine.ranking().slice(0, 5).map((p, i) => (
        <li key={p.id}>
          <span className="rank">{["🥇", "🥈", "🥉", "4", "5"][i]}</span>
          <span className="grow">{p.name}</span>
          <b>{p.score}</b>
        </li>
      ))}
    </ol>
  );
}
