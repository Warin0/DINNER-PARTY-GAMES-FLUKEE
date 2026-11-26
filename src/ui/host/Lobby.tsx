import { useEffect, useMemo, useState } from "react";
import type { HostEngine } from "../../engine/host";
import { ENABLED_GAMES } from "../../config";
import { fileToPicture } from "../../lib/image";
import { normalizeGuess, parseCustomWords } from "../../lib/words";
import { Scoreboard } from "./Scoreboard";

interface WordCard {
  id: string;
  /** "word" or "word|other accepted answer" */
  word: string;
  /** small JPEG data URL, shown only to the drawer before they start */
  img?: string;
}

const CARDS_KEY = "opl-cards";
const uid = () => Math.random().toString(36).slice(2, 9);

function loadCards(): WordCard[] {
  try {
    const raw = localStorage.getItem(CARDS_KEY);
    if (raw) return JSON.parse(raw);
    // migrate the earlier plain-text word list
    const old = localStorage.getItem("opl-custom-words");
    if (old) return parseCustomWords(old).map((word) => ({ id: uid(), word }));
  } catch {
    /* ignore */
  }
  return [];
}

export function Lobby({ engine, qr, joinUrl }: { engine: HostEngine; qr: string; joinUrl: string }) {
  const players = [...engine.players.values()];
  const ready = players.filter((p) => p.ready).length;

  const [rounds, setRounds] = useState(8);
  const [seconds, setSeconds] = useState(60);
  const [study, setStudy] = useState(20);
  const [cards, setCards] = useState<WordCard[]>(loadCards);
  const [customOnly, setCustomOnly] = useState(() => localStorage.getItem("opl-custom-only") === "1");
  const [draft, setDraft] = useState("");
  const [storeFull, setStoreFull] = useState(false);
  const [imgErr, setImgErr] = useState("");

  const [interval, setIntervalSec] = useState(6);
  const [pattern, setPattern] = useState<"line" | "full">("line");
  const [target, setTarget] = useState(120);
  const [raceSecs, setRaceSecs] = useState(45);

  useEffect(() => {
    try {
      localStorage.setItem(CARDS_KEY, JSON.stringify(cards));
      setStoreFull(false);
    } catch {
      setStoreFull(true);
    }
  }, [cards]);
  useEffect(() => localStorage.setItem("opl-custom-only", customOnly ? "1" : "0"), [customOnly]);

  /** engine inputs: de-duplicated word entries plus the pictures keyed by their display word */
  const { words, images } = useMemo(() => {
    const seen = new Set<string>();
    const words: string[] = [];
    const images: Record<string, string> = {};
    for (const c of cards) {
      for (const entry of parseCustomWords(c.word)) {
        const key = normalizeGuess(entry.split("|")[0]);
        if (seen.has(key)) continue;
        seen.add(key);
        words.push(entry);
        if (c.img) images[key] = c.img;
      }
    }
    return { words, images };
  }, [cards]);
  const withPics = Object.keys(images).length;

  const addWords = (text: string) => {
    const have = new Set(cards.map((c) => normalizeGuess(c.word.split("|")[0])));
    const fresh = parseCustomWords(text).filter((w) => !have.has(normalizeGuess(w.split("|")[0])));
    if (fresh.length) setCards((cs) => [...cs, ...fresh.map((word) => ({ id: uid(), word }))].slice(0, 300));
  };
  const setPic = async (id: string, file?: File) => {
    if (!file) return;
    setImgErr("");
    try {
      const img = await fileToPicture(file);
      setCards((cs) => cs.map((c) => (c.id === id ? { ...c, img } : c)));
    } catch {
      setImgErr("Couldn't use that picture — try a different one.");
    }
  };

  return (
    <div className="lobby">
      <div className="lobby-left">
        <section className="card joincard">
          <h2>Scan to join</h2>
          {qr && <img src={qr} alt="QR code to join" className="qr" />}
          <div className="bigcode">{engine.room}</div>
          <div className="muted small">{joinUrl.replace(/^https?:\/\//, "")}</div>
        </section>

        <section className="card roster">
          <h2>
            Players <span className="pill">{players.length}</span> <span className="pill ok">✋ {ready} ready</span>
          </h2>
          <div className="chips">
            {players.length === 0 && <p className="muted">Waiting for players to scan the code…</p>}
            {players.map((p) => (
              <span
                key={p.id}
                className={"chip" + (p.ready ? " ready" : "") + (engine.ctx.online(p) ? "" : " off")}
                style={{ borderColor: p.color }}
                title="click to remove"
                onClick={() => confirm(`Remove ${p.name}?`) && engine.kick(p.id)}
              >
                <i style={{ background: p.color }} />
                {p.name}
              </span>
            ))}
          </div>
          <p className="muted small">Players tap <b>“I’m ready to draw”</b> on their phone to join the drawing pool.</p>
        </section>
      </div>

      <section className="games">
        {ENABLED_GAMES.draw && (
          <div className="card game setup">
            <h2>🎨 Draw &amp; Guess</h2>
            <p className="muted small">
              A random <b>ready</b> player gets a secret word and picture on their phone, studies it, then taps <b>“I’m ready to draw”</b> — the picture hides and the clock starts.
              Everyone else types guesses. <b>Faster guess = more points</b>; the drawer earns 50 per correct guesser.
            </p>

            <div className="fields">
              <label>
                Rounds
                <input type="number" min={1} max={40} value={rounds} onChange={(e) => setRounds(+e.target.value)} />
              </label>
              <label>
                Drawing time (s)
                <input type="number" min={20} max={180} value={seconds} onChange={(e) => setSeconds(+e.target.value)} />
              </label>
              <label>
                Study time (s)
                <input type="number" min={5} max={60} value={study} onChange={(e) => setStudy(+e.target.value)} />
              </label>
            </div>
            {rounds > ready && ready > 0 && <div className="note">Rounds are capped at the number of ready players ({ready}).</div>}

            <div className="wordshead">
              <h3>Your words &amp; pictures</h3>
              <span className="muted small">{words.length} words · {withPics} with a picture</span>
            </div>
            <p className="muted small">
              Add your own words and attach a photo to any of them — only the drawer sees it, before they start. Add other accepted answers with <code>|</code>, e.g. <code>fried chicken|chicken</code>. Words without a photo use the built-in emoji picture when there is one.
            </p>

            <form
              className="addword"
              onSubmit={(e) => {
                e.preventDefault();
                addWords(draft);
                setDraft("");
              }}
            >
              <input
                className="input"
                value={draft}
                placeholder="Type a word and press Enter — or paste a whole list"
                onChange={(e) => setDraft(e.target.value)}
                onPaste={(e) => {
                  const t = e.clipboardData.getData("text");
                  if (/[\n;]/.test(t)) {
                    e.preventDefault();
                    addWords(t);
                  }
                }}
              />
              <button className="btn alt" type="submit" disabled={!draft.trim()}>Add</button>
            </form>

            {cards.length > 0 && (
              <div className="wcards">
                {cards.map((c) => (
                  <div className="wcard" key={c.id}>
                    <label className={"thumb" + (c.img ? " has" : "")} title={c.img ? "Change picture" : "Add a picture"}>
                      {c.img ? <img src={c.img} alt="" /> : <span>🖼️<small>＋</small></span>}
                      <input
                        type="file"
                        accept="image/*"
                        hidden
                        onChange={(e) => {
                          void setPic(c.id, e.target.files?.[0]);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    <input
                      className="wword"
                      value={c.word}
                      maxLength={80}
                      onChange={(e) => setCards((cs) => cs.map((x) => (x.id === c.id ? { ...x, word: e.target.value } : x)))}
                    />
                    {c.img && (
                      <button className="x" title="Remove picture" onClick={() => setCards((cs) => cs.map((x) => (x.id === c.id ? { ...x, img: undefined } : x)))}>
                        🖼️✕
                      </button>
                    )}
                    <button className="x" title="Remove word" onClick={() => setCards((cs) => cs.filter((x) => x.id !== c.id))}>✕</button>
                  </div>
                ))}
              </div>
            )}
            {imgErr && <div className="note">{imgErr}</div>}
            {storeFull && <div className="note">Browser storage is full — your pictures will be lost if you reload this page. Remove a few pictures.</div>}

            <div className="row spread">
              <label className="check">
                <input type="checkbox" checked={customOnly} onChange={(e) => setCustomOnly(e.target.checked)} />
                Use only my words ({words.length})
              </label>
              {cards.length > 0 && (
                <button className="btn small" onClick={() => confirm("Remove all your words and pictures?") && setCards([])}>Clear all</button>
              )}
            </div>
            {customOnly && words.length > 0 && words.length < rounds && <div className="note">Fewer words than rounds — words will repeat.</div>}
            {customOnly && words.length === 0 && <div className="note">No words entered — built-in words will be used.</div>}

            <button
              className="btn big"
              disabled={ready < 1}
              onClick={() =>
                engine.startGame({
                  game: "draw",
                  opts: { rounds, seconds, prepMs: study * 1000, customWords: words, customOnly, images }
                })
              }
            >
              {ready < 1 ? "Waiting for a ready player…" : `Start drawing · ${ready} ready`}
            </button>
          </div>
        )}

        {ENABLED_GAMES.bingo && (
          <div className="card game">
            <h3>🎱 Bingo</h3>
            <p className="muted small">Every phone gets its own card. Numbers are called automatically — tap to mark, shout BINGO!</p>
            <div className="fields">
              <label>Seconds / number<input type="number" min={2} max={20} value={interval} onChange={(e) => setIntervalSec(+e.target.value)} /></label>
              <label>Win by
                <select value={pattern} onChange={(e) => setPattern(e.target.value as "line" | "full")}>
                  <option value="line">Any line</option>
                  <option value="full">Full card</option>
                </select>
              </label>
            </div>
            <button className="btn big" disabled={players.length < 1} onClick={() => engine.startGame({ game: "bingo", opts: { intervalMs: interval * 1000, pattern } })}>
              Start bingo
            </button>
          </div>
        )}

        {ENABLED_GAMES.race && (
          <div className="card game">
            <h3>🏃 Finger Race</h3>
            <p className="muted small">Alternate your thumbs left-right-left-right as fast as you can. First to the finish wins.</p>
            <div className="fields">
              <label>Steps to finish<input type="number" min={30} max={400} value={target} onChange={(e) => setTarget(+e.target.value)} /></label>
              <label>Time limit (s)<input type="number" min={15} max={120} value={raceSecs} onChange={(e) => setRaceSecs(+e.target.value)} /></label>
            </div>
            <button className="btn big" disabled={players.length < 1} onClick={() => engine.startGame({ game: "race", opts: { target, seconds: raceSecs } })}>
              Start race
            </button>
          </div>
        )}
      </section>

      <section className="lobby-scores"><Scoreboard engine={engine} /></section>
    </div>
  );
}
