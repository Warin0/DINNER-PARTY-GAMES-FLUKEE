import type { HostEngine } from "../../engine/host";
import type { BingoGame } from "../../engine/bingo";
import { fmtSecs } from "../hooks";

const LETTERS = ["B", "I", "N", "G", "O"];

export function letterFor(n: number) {
  return LETTERS[Math.min(4, Math.floor((n - 1) / 15))];
}

export function BingoHost({ engine, game }: { engine: HostEngine; game: BingoGame }) {
  const pub = game.pub();
  const last = pub.called[pub.called.length - 1];
  const calledSet = new Set(pub.called);
  const nextIn = fmtSecs(pub.nextAt - Date.now());

  return (
    <div className="bingohost">
      <div className="bingomain">
        <div className="callbox">
          {last ? (
            <>
              <div className="ball" key={last}>
                <small>{letterFor(last)}</small>
                <b>{last}</b>
              </div>
              {pub.called.length > 1 && (
                <div className="prevballs">
                  {pub.called.slice(-6, -1).reverse().map((n) => (
                    <span key={n} className="miniball">{letterFor(n)}{n}</span>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="ball empty"><b>…</b></div>
          )}
          <div className="muted">
            {pub.stage === "running" ? `Next number in ${nextIn}s · ${pub.called.length}/75 called` : "Bingo finished"}
            {" · "}Win by {pub.pattern === "line" ? "any line" : "full card"}
          </div>
        </div>
        <div className="board">
          {LETTERS.map((L, c) => (
            <div key={L} className="bcol">
              <div className="bhead">{L}</div>
              {Array.from({ length: 15 }, (_, i) => c * 15 + i + 1).map((n) => (
                <div key={n} className={"bnum" + (calledSet.has(n) ? " on" : "") + (n === last ? " last" : "")}>{n}</div>
              ))}
            </div>
          ))}
        </div>
      </div>
      <aside className="bingoside">
        <div className="card">
          <h3>🏆 Winners</h3>
          {pub.winners.length === 0 && <p className="muted">Nobody has called BINGO yet…</p>}
          <ol className="podium">
            {pub.winners.map((w) => (
              <li key={w.place}><span className="rank">{["🥇", "🥈", "🥉"][w.place - 1] ?? w.place}</span><span className="grow">{w.name}</span></li>
            ))}
          </ol>
          {pub.stage === "over" && <button className="btn big" onClick={() => engine.endGame()}>Back to lobby</button>}
        </div>
      </aside>
    </div>
  );
}
