import { useEffect, useRef, useState } from "react";
import type { HostEngine } from "../../engine/host";
import type { DrawGame, Stroke } from "../../engine/draw";
import { fmtSecs } from "../hooks";
import { HintTiles } from "../HintTiles";
import { BASE_POINTS, SPEED_MAX } from "../../engine/draw";

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
  const prepLeft = (pub.prepEndsAt ?? 0) - now;

  if (pub.stage === "over") return <DrawSummary engine={engine} game={game} />;

  return (
    <div className="drawhost">
      <div className="drawmain">
        <div className="drawtop">
          <span className="pill">Round {pub.round}/{pub.rounds}</span>
          <span className="drawer">
            {pub.stage === "prep" ? "🤔" : pub.stage === "draw" ? "✏️" : "🎨"} <b>{pub.drawerName}</b>{" "}
            {pub.stage === "prep" ? "is getting ready" : pub.stage === "draw" ? "is drawing" : "drew this"}
          </span>
          <span className="spacer" />
          {(pub.stage === "draw" || pub.stage === "prep") && <SkipButton game={game} />}
          {pub.stage === "draw" && <span className={"timer" + (left <= 10000 ? " urgent" : "")}>{fmtSecs(left)}s</span>}
        </div>
        {pub.stage === "draw" && (
          <div className="bar"><i style={{ width: `${Math.max(0, Math.min(100, (left / total) * 100))}%` }} /></div>
        )}
        {pub.stage === "prep" && (
          <div className="bar prepbar"><i style={{ width: `${Math.max(0, Math.min(100, (prepLeft / Math.max(1, game.prepMs)) * 100))}%` }} /></div>
        )}

        {pub.stage === "draw" && <HintTiles hint={pub.hint} className="t-host" />}
        {pub.stage === "reveal" && (
          <div className="revealbanner">
            {pub.emoji && <span className="remoji">{pub.emoji}</span>}
            <span>The word was <b>{pub.word}</b></span>
          </div>
        )}

        {pub.stage === "prep" ? (
          <div className="prepstage">
            <div className="thinker">🤔</div>
            <h2>{pub.drawerName} is looking at their secret word…</h2>
            <p className="muted">The clock starts when they tap <b>“I’m ready to draw”</b> on their phone{pub.prepEndsAt ? ` — or in ${fmtSecs(prepLeft)}s` : ""}.</p>
            <p className="muted small">Not here? Use <b>Skip drawer</b> to pick someone else.</p>
          </div>
        ) : (
          <Canvas game={game} />
        )}
      </div>
      <aside className="drawside">
        {pub.stage === "reveal" && <RoundRecap game={game} />}
        {pub.stage !== "reveal" && (<>
        <div className="card">
          <h3>✅ Guessed it <span className="pill">{pub.solvedCount}/{pub.guessers}</span></h3>
          <div className="chips">
            {pub.solvers.map((n, i) => <span key={i} className="chip ready">{n}</span>)}
            {pub.solvers.length === 0 && <span className="muted small">{pub.stage === "prep" ? "Waiting for the drawer…" : "Nobody yet…"}</span>}
          </div>
        </div>
        <div className="card feed">
          <h3>💬 Guesses</h3>
          {[...game.feed].reverse().slice(0, 14).map((f, i) => (
            <div key={f.at + "-" + i} className={"fitem" + (f.ok ? " ok" : "")}>
              <b>{f.name}</b> {f.ok ? "got it! 🎉" : f.text}
            </div>
          ))}
          {game.feed.length === 0 && <span className="muted small">Guesses will pop up here.</span>}
        </div>
        </>)}
      </aside>
    </div>
  );
}

const secs = (ms: number) => (ms / 1000).toFixed(1) + "s";
const MEDALS = ["🥇", "🥈", "🥉"];

/** shown beside the canvas while the word is revealed: who guessed fastest + running standings */
function RoundRecap({ game }: { game: DrawGame }) {
  const last = game.history[game.history.length - 1];
  if (!last) return null;
  const standings = game.sessionRanking().slice(0, 8);
  return (
    <>
      <div className="card recap">
        <h3>⚡ Round {last.round} results</h3>
        <div className="muted small">Faster guess = more points ({BASE_POINTS}–{BASE_POINTS + SPEED_MAX})</div>
        <ol className="podium tight">
          {last.solvers.slice(0, 8).map((s, i) => (
            <li key={s.id}>
              <span className="rank">{MEDALS[i] ?? i + 1}</span>
              <span className="grow">{s.name}</span>
              <span className="muted small">{secs(s.ms)}</span>
              <b>+{s.points}</b>
            </li>
          ))}
          {last.solvers.length === 0 && <li className="muted">Nobody guessed it 😅</li>}
        </ol>
        {last.solvers.length > 8 && <div className="muted small">+{last.solvers.length - 8} more guessed it</div>}
        <div className="muted small">🎨 {last.drawerName} earns +{last.drawerPoints} for drawing</div>
      </div>
      <div className="card recap">
        <h3>🏆 Standings</h3>
        <ol className="podium tight">
          {standings.map((r, i) => {
            const gain = game.perRoundOf(r.id)[last.round - 1] ?? 0;
            return (
              <li key={r.id}>
                <span className="rank">{i + 1}</span>
                <span className="dot" style={{ background: r.color }} />
                <span className="grow">{r.name}</span>
                {gain > 0 && <span className="gain">+{gain}</span>}
                <b>{r.total}</b>
              </li>
            );
          })}
        </ol>
      </div>
    </>
  );
}

/** end-of-game summary: podium, awards, full table with a column per round */
function DrawSummary({ engine, game }: { engine: HostEngine; game: DrawGame }) {
  const ranking = game.sessionRanking();
  const top3 = ranking.slice(0, 3);
  const fastest = game.history
    .flatMap((h) => h.solvers.map((s) => ({ ...s, word: h.word })))
    .sort((a, b) => a.ms - b.ms)[0];
  const bestArtist = [...game.history].sort((a, b) => b.drawerPoints - a.drawerPoints)[0];
  const showCols = game.history.length > 0 && game.history.length <= 12;
  const rows = ranking.slice(0, 15);
  const podiumOrder = [1, 0, 2]; // 2nd, 1st, 3rd

  return (
    <div className="summary">
      <h1>🏁 Final results — {game.history.length} round{game.history.length === 1 ? "" : "s"}</h1>

      <div className="podium3">
        {podiumOrder.map((idx) => {
          const r = top3[idx];
          if (!r) return <div key={idx} className="pod empty" />;
          return (
            <div key={r.id} className={`pod p${idx + 1}`}>
              <div className="medal">{MEDALS[idx]}</div>
              <div className="pname" style={{ borderColor: r.color }}>{r.name}</div>
              <div className="ppts">{r.total}</div>
              <div className="block" />
            </div>
          );
        })}
      </div>

      <div className="awards">
        {fastest && (
          <div className="card award">⚡ <b>Fastest guess</b><br />{fastest.name} · {secs(fastest.ms)}<br /><span className="muted small">“{fastest.word}”</span></div>
        )}
        {bestArtist && bestArtist.drawerPoints > 0 && (
          <div className="card award">🎨 <b>Best artist</b><br />{bestArtist.drawerName}<br /><span className="muted small">{bestArtist.solvers.length} guessed “{bestArtist.word}”</span></div>
        )}
      </div>

      <div className="card tablecard">
        <table className="scoretable">
          <thead>
            <tr>
              <th>#</th><th className="l">Player</th>
              {showCols && game.history.map((h) => <th key={h.round}>R{h.round}</th>)}
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const per = game.perRoundOf(r.id);
              return (
                <tr key={r.id} className={i < 3 ? "top" : ""}>
                  <td>{MEDALS[i] ?? i + 1}</td>
                  <td className="l"><span className="dot" style={{ background: r.color }} /> {r.name}</td>
                  {showCols && game.history.map((h, k) => <td key={h.round} className={per[k] ? "" : "zero"}>{per[k] || "–"}</td>)}
                  <td><b>{r.total}</b></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {ranking.length > rows.length && <div className="muted small">+{ranking.length - rows.length} more players</div>}
      </div>

      <div className="row">
        <button className="btn big" style={{ maxWidth: 360 }} onClick={() => engine.endGame()}>Back to lobby</button>
      </div>
      <p className="muted small">Points from all games add up on the 🏆 Scores board (top bar).</p>
    </div>
  );
}

/** Host control: replace an absent/stuck drawer. Two taps so it can't be hit by accident. */
function SkipButton({ game }: { game: DrawGame }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3500);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      className={"btn small" + (armed ? " danger" : "")}
      title="Replace the current drawer. This round is voided and replayed with someone else."
      onClick={() => {
        if (!armed) return setArmed(true);
        setArmed(false);
        game.skipDrawer();
      }}
    >
      {armed ? "Tap again to skip" : "⏭ Skip drawer"}
    </button>
  );
}
