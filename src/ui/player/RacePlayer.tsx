import { useEffect, useRef, useState } from "react";
import type { PlayerClient } from "../../lib/client";
import type { RacePub } from "../../lib/protocol";
import { useTicker } from "../hooks";

export function RacePlayer({ client }: { client: PlayerClient }) {
  useTicker(100);
  const v = client.view;
  const g = v.state!.g as RacePub;
  const [steps, setSteps] = useState(0);
  const last = useRef<"L" | "R" | null>(null);
  const sent = useRef(0);
  const stepsRef = useRef(0);
  const now = client.now();
  const started = now >= g.startAt;
  const over = g.stage === "over" || now > g.endsAt;
  const finished = steps >= g.target;

  // reset for a new race
  useEffect(() => {
    setSteps(0); stepsRef.current = 0; sent.current = 0; last.current = null;
  }, [g.startAt]);

  // throttled reporting: ~1.4 msgs/s per phone keeps 80 runners well under the realtime message limit
  useEffect(() => {
    const t = setInterval(() => {
      if (stepsRef.current !== sent.current) {
        sent.current = stepsRef.current;
        client.steps(stepsRef.current);
      }
    }, 700);
    return () => clearInterval(t);
  }, [client]);

  const press = (side: "L" | "R") => {
    if (!started || over || finished) return;
    if (last.current !== side) {
      last.current = side;
      stepsRef.current += 1;
      setSteps(stepsRef.current);
      navigator.vibrate?.(8);
      if (stepsRef.current >= g.target) {
        sent.current = stepsRef.current;
        client.steps(stepsRef.current);
      }
    }
  };

  if (!started) {
    return (
      <div className="center-block">
        <h2>Get ready…</h2>
        <div className="timer big">{Math.max(0, Math.ceil((g.startAt - now) / 1000))}</div>
        <p className="muted">Hold your phone with both thumbs over the buttons.</p>
      </div>
    );
  }

  return (
    <div className="race">
      <div className="progress"><i style={{ width: `${Math.min(100, (steps / g.target) * 100)}%` }} /><span>{steps}/{g.target}</span></div>
      {finished ? (
        <div className="solved">🏁 You finished!<br /><small>Check the big screen for results</small></div>
      ) : over ? (
        <div className="muted">Race over — look at the big screen.</div>
      ) : (
        <>
          <p className="muted small">Alternate left ↔ right as fast as you can!</p>
          <div className="runpads">
            <button className="runpad" onPointerDown={() => press("L")}>👟<span>LEFT</span></button>
            <button className="runpad alt" onPointerDown={() => press("R")}>👟<span>RIGHT</span></button>
          </div>
        </>
      )}
    </div>
  );
}
