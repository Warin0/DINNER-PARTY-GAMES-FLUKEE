import type { HostEngine } from "../../engine/host";

export function Scoreboard({ engine, onClose }: { engine: HostEngine; onClose?: () => void }) {
  const rows = engine.ranking().slice(0, 12);
  return (
    <div className={onClose ? "overlay" : ""} onClick={onClose}>
      <div className="card scoreboard" onClick={(e) => e.stopPropagation()}>
        <h2>🏆 Leaderboard</h2>
        {rows.length === 0 && <p className="muted">No players yet.</p>}
        <ol>
          {rows.map((p, i) => (
            <li key={p.id}>
              <span className="rank">{i + 1}</span>
              <span className="dot" style={{ background: p.color }} />
              <span className="grow">{p.name}</span>
              <b>{p.score}</b>
            </li>
          ))}
        </ol>
        {onClose && (
          <div className="row">
            <button className="btn ghost" onClick={() => engine.resetScores()}>Reset scores</button>
            <button className="btn" onClick={onClose}>Close</button>
          </div>
        )}
      </div>
    </div>
  );
}
