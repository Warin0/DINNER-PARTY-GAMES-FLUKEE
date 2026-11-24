import { useEffect, useState } from "react";
import type { PlayerClient } from "../../lib/client";
import type { BingoPub } from "../../lib/protocol";
import { useTicker } from "../hooks";

const LETTERS = ["B", "I", "N", "G", "O"];
const letterFor = (n: number) => LETTERS[Math.min(4, Math.floor((n - 1) / 15))];

export function BingoPlayer({ client }: { client: PlayerClient }) {
  useTicker(500);
  const v = client.view;
  const g = v.state!.g as BingoPub;
  const card = v.card;
  const key = `opl-marks-${client.room}-${card ? card.flat().join(",") : ""}`;
  const [marks, setMarks] = useState<Set<number>>(new Set());

  useEffect(() => {
    try {
      setMarks(new Set(JSON.parse(sessionStorage.getItem(key) || "[]")));
    } catch {
      setMarks(new Set());
    }
  }, [key]);

  const toggle = (n: number) => {
    if (n === 0) return;
    const next = new Set(marks);
    next.has(n) ? next.delete(n) : next.add(n);
    setMarks(next);
    try { sessionStorage.setItem(key, JSON.stringify([...next])); } catch { /* ignore */ }
  };

  const called = new Set(g.called);
  const last = g.called[g.called.length - 1];
  const claim = v.claim;
  const lockLeft = claim && !claim.ok ? Math.max(0, claim.lockUntil - Date.now()) : 0;
  const won = !!claim?.ok;

  if (!card) return <div className="center-block"><h2>Getting your card…</h2></div>;

  return (
    <div className="bingo">
      <div className="lastcall">
        {last ? <><small>{letterFor(last)}</small><b>{last}</b></> : <span className="muted">Waiting for the first number…</span>}
        <span className="muted small">{g.called.length}/75</span>
      </div>
      <div className="card5">
        {LETTERS.map((L) => <div key={L} className="ch">{L}</div>)}
        {card.flatMap((row, r) =>
          row.map((n, c) => {
            const free = n === 0;
            const m = free || marks.has(n);
            const isCalled = free || called.has(n);
            return (
              <button key={`${r}-${c}`} className={"cell" + (m ? " marked" : "") + (!m && isCalled ? " calledhint" : "")} onClick={() => toggle(n)}>
                {free ? "★" : n}
              </button>
            );
          })
        )}
      </div>
      {won ? (
        <div className="solved">🎉 BINGO! You're #{claim!.place}</div>
      ) : g.stage === "over" ? (
        <div className="muted">Bingo is over — look at the big screen.</div>
      ) : (
        <>
          <button className="btn big bingobtn" disabled={lockLeft > 0} onClick={() => client.claim()}>
            {lockLeft > 0 ? `Not yet! wait ${Math.ceil(lockLeft / 1000)}s` : "BINGO!"}
          </button>
          <small className="muted">Tap numbers as they're called. Called-but-unmarked numbers glow.</small>
        </>
      )}
    </div>
  );
}
