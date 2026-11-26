/** Renders the "_ _ a _" hint string as letter tiles. Characters are joined by single spaces; a word gap shows up as extra empty tokens. */
export function HintTiles({ hint, className = "" }: { hint: string; className?: string }) {
  const tokens = hint.split(" ");
  const out: { ch: string; gap?: boolean }[] = [];
  for (const t of tokens) {
    if (t === "") {
      if (out.length && !out[out.length - 1].gap) out.push({ ch: "", gap: true });
    } else out.push({ ch: t });
  }
  return (
    <div className={"tiles " + className} aria-label="hint">
      {out.map((o, i) =>
        o.gap ? <span key={i} className="tile gap" /> : <span key={i} className={"tile" + (o.ch === "_" ? "" : " on")}>{o.ch === "_" ? "" : o.ch}</span>
      )}
    </div>
  );
}

/** circular countdown */
export function Ring({ left, total, small = false }: { left: number; total: number; small?: boolean }) {
  const secs = Math.max(0, Math.ceil(left / 1000));
  const p = Math.max(0, Math.min(100, (left / Math.max(1, total)) * 100));
  return (
    <div className={"ring" + (small ? " sm" : "") + (secs <= 10 ? " urgent" : "")} style={{ ["--p" as any]: p }}>
      <span>{secs}</span>
    </div>
  );
}
