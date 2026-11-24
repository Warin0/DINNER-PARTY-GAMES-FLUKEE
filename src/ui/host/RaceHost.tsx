import type { HostEngine } from "../../engine/host";
import type { RaceGame } from "../../engine/race";
import { fmtSecs } from "../hooks";

export function RaceHost({ engine, game }: { engine: HostEngine; game: RaceGame }) {
  const pub = game.pub();
  const now = Date.now();
  const rows = game.standings();
  const lanes = rows.slice(0, 8);
  const countdown = Math.ceil((pub.startAt - now) / 1000);

  return (
    <div className="racehost">
      {now < pub.startAt && pub.stage !== "over" && <div className="countdown">{countdown > 0 ? countdown : "GO!"}</div>}
      <div className="racetop">
        <span className="pill">🏁 {pub.target} steps</span>
        <span className="spacer" />
        {pub.stage === "run" && <span className="timer">{fmtSecs(pub.endsAt - now)}s</span>}
        {pub.stage === "over" && <button className="btn" onClick={() => engine.endGame()}>Back to lobby</button>}
      </div>

      <div className="lanes">
        {lanes.map((r, i) => (
          <div className="lane" key={r.id}>
            <span className="lname">{i + 1}. {r.name}</span>
            <div className="track">
              <span className="runner" style={{ left: `calc(${(r.steps / pub.target) * 100}% - ${(r.steps / pub.target) * 36}px)` }}>
                <span className="emoji" style={{ transform: r.steps % 2 ? "scaleX(1)" : "scaleX(1)" }}>{r.place ? "🏆" : r.steps % 2 ? "🏃" : "🏃‍♂️"}</span>
              </span>
              <span className="finish">🏁</span>
            </div>
          </div>
        ))}
        {lanes.length === 0 && <p className="muted">No runners yet.</p>}
      </div>

      <div className="pack">
        <div className="muted small">Everyone ({rows.length} runners)</div>
        <div className="packtrack">
          {rows.map((r) => (
            <i key={r.id} className="pdot" style={{ left: `${(r.steps / pub.target) * 96}%`, background: r.color, top: `${(parseInt(r.id.slice(-2), 36) || 0) % 70}%` }} title={r.name} />
          ))}
        </div>
      </div>

      {pub.stage === "over" && (
        <div className="card podiumbox">
          <h2>🏁 Results</h2>
          <ol className="podium">
            {rows.filter((r) => r.place).slice(0, 5).map((r) => (
              <li key={r.id}><span className="rank">{["🥇", "🥈", "🥉", "4", "5"][(r.place ?? 1) - 1]}</span><span className="grow">{r.name}</span></li>
            ))}
            {rows.every((r) => !r.place) && <li className="muted">Nobody reached the finish line!</li>}
          </ol>
        </div>
      )}
    </div>
  );
}
