import { useEffect, useState } from "react";

/** re-render every `ms` milliseconds (for countdowns) */
export function useTicker(ms = 250) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}

export function useSubscribe(listeners: Set<() => void> | undefined) {
  const [, set] = useState(0);
  useEffect(() => {
    if (!listeners) return;
    const l = () => set((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, [listeners]);
}

export function randomId(len = 10) {
  const chars = "abcdefghijkmnpqrstuvwxyz23456789";
  let s = "";
  const a = crypto.getRandomValues(new Uint8Array(len));
  for (const v of a) s += chars[v % chars.length];
  return s;
}

export function randomRoom() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  let s = "";
  const a = crypto.getRandomValues(new Uint8Array(4));
  for (const v of a) s += chars[v % chars.length];
  return s;
}

export function fmtSecs(ms: number) {
  return Math.max(0, Math.ceil(ms / 1000));
}
