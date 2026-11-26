// Load test: 80 bots + host engine on an in-memory bus, using the real protocol.
// Usage: npm run simulate
import { HostEngine } from "../src/engine/host";
import { hasWin } from "../src/engine/bingo";
import { PlayerClient } from "../src/lib/client";
import { MemoryBus, MemoryTransport } from "../src/lib/transport";
import { WORDS, parseCustomWords } from "../src/lib/words";

const N = 80;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name: string, ok: boolean, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
  if (!ok) failures++;
}

const bus = new MemoryBus();
const marks: { name: string; idx: number }[] = [];
const mark = (name: string) => marks.push({ name, idx: bus.perSecond.length });
const host = new HostEngine(new MemoryTransport(bus), "TEST");
const bots: PlayerClient[] = [];
for (let i = 0; i < N; i++) {
  bots.push(new PlayerClient(new MemoryTransport(bus), "TEST", `bot-${i}`, `Bot ${i}`));
}
await sleep(300);
check("80 players joined", host.players.size === N, `(${host.players.size})`);

bots.forEach((b, i) => i % 2 === 0 && b.setReady(true)); // 40 ready
await sleep(600);
check("ready count = 40", [...host.players.values()].filter((p) => p.ready).length === 40);

// ---------- DRAW & GUESS ----------
mark("draw");
{
  host.startGame({ game: "draw", opts: { rounds: 3, seconds: 5, revealMs: 500, prepMs: 0 } });
  await sleep(500);
  const seenDrawers = new Set<string>();
  let correct = 0;
  let strokesSeen = 0;
  const dg = host.game as any;
  dg.listeners.add((ev: string) => ev === "stroke" && strokesSeen++);
  for (let round = 1; round <= 3; round++) {
    await sleep(500);
    const pub = (host.game as any).pub();
    const drawer = bots.find((b) => b.id === pub.drawerId)!;
    seenDrawers.add(drawer.id);
    check(`round ${round}: drawer is a ready player`, host.players.get(drawer.id)!.ready);
    check(`round ${round}: drawer got a word privately`, !!drawer.view.word);
    // nobody else received the word
    const leaked = bots.filter((b) => b !== drawer && b.view.word?.round === round).length;
    check(`round ${round}: word not leaked to guessers`, leaked === 0);
    const word = drawer.view.word!.word;
    for (let k = 0; k < 6; k++) {
      drawer.stroke("#000", 4, [[0.1 * k, 0.2], [0.1 * k + 0.05, 0.3]], drawer.newStrokeId());
    }
    // 30 wrong guesses, 20 correct guesses (some with the Thai/English alternatives n/a)
    bots.filter((b) => b !== drawer).slice(0, 30).forEach((b) => b.guess("definitely wrong"));
    const correctBots = bots.filter((b) => b !== drawer).slice(30, 50);
    correctBots.forEach((b) => b.guess("  " + word.toUpperCase() + " "));
    correct += correctBots.length;
    await sleep(500);
    const solved = (host.game as any).pub().solvedCount;
    check(`round ${round}: ${correctBots.length} correct guesses scored`, solved === correctBots.length, `(${solved})`);
    // wait for round to end & reveal to pass
    const before = (host.game as any).pub().round;
    for (let t = 0; t < 40 && (host.game as any).pub().stage === "draw" && (host.game as any).pub().round === before; t++) await sleep(250);
    await sleep(200);
  }
  await sleep(1200);
  check("game over after configured rounds", (host.game as any).pub().stage === "over", `(${(host.game as any).pub().stage})`);
  check("3 different drawers", seenDrawers.size === 3);
  check("strokes reached host", strokesSeen >= 18, `(${strokesSeen})`);
  check("guessers earned points", [...host.players.values()].some((p) => p.score >= 50));
  // a non-ready player must never draw
  check("no unready drawer", [...seenDrawers].every((id) => host.players.get(id)!.ready));
  host.endGame();
  await sleep(300);
  check("phones got rank/score after round", bots.some((b) => b.view.score > 0 && b.view.rank > 0));
}

// ---------- DRAW with host-supplied words ----------
mark("custom-draw");
{
  host.resetScores();
  const parsed = parseCustomWords("alpha|a1\n beta ,  alpha \n\n gamma|g|gee");
  check("custom words parsed, de-duplicated", parsed.length === 3 && parsed[0] === "alpha|a1", JSON.stringify(parsed));
  host.startGame({ game: "draw", opts: { rounds: 3, seconds: 4, revealMs: 300, prepMs: 0, customWords: parsed, customOnly: true } });
  await sleep(500);
  const shown: string[] = [];
  for (let round = 1; round <= 3; round++) {
    const pub = (host.game as any).pub();
    const drawer = bots.find((b) => b.id === pub.drawerId)!;
    const w = drawer.view.word!.word;
    shown.push(w);
    // guess using the second accepted answer where there is one
    const guesser = bots.find((b) => b !== drawer && b.id !== pub.drawerId)!;
    guesser.guess(w === "alpha" ? "A1" : w === "gamma" ? "gee" : w);
    await sleep(400);
    check(`custom round ${round}: "${w}" accepted via alternative answer`, (host.game as any).pub().solvedCount >= 1);
    for (let t = 0; t < 60 && (host.game as any).pub().round === round && (host.game as any).pub().stage === "draw"; t++) await sleep(150);
    await sleep(500);
  }
  check("only custom words were used", shown.every((w) => ["alpha", "beta", "gamma"].includes(w)), JSON.stringify(shown));
  check("all three custom words appeared once each", new Set(shown).size === 3);
  host.endGame();
}

// ---------- SCORING ACROSS ROUNDS ----------
mark("scoring");
{
  host.resetScores();
  host.startGame({ game: "draw", opts: { rounds: 3, seconds: 4, revealMs: 400, prepMs: 0 } });
  await sleep(400);
  const fast = bots[1]; // odd bots are not ready, so they never draw
  const slow = bots[3];
  const dg = host.game as any;
  const drawers: string[] = [];
  const fastPts: number[] = [];
  const slowPts: number[] = [];
  for (let round = 1; round <= 3; round++) {
    // wait for this round to be live
    for (let t = 0; t < 60 && !(dg.pub().round === round && dg.pub().stage === "draw"); t++) await sleep(100);
    const pub = dg.pub();
    const drawer = bots.find((b) => b.id === pub.drawerId)!;
    drawers.push(drawer.id);
    const word = drawer.view.word!.word;
    fast.guess(word); // immediately
    await sleep(1600);
    slow.guess(word); // ~1.6 s later
    await sleep(300);
    for (let t = 0; t < 80 && dg.pub().round === round && dg.pub().stage === "draw"; t++) await sleep(100);
    const h = dg.history[round - 1];
    const f = h.solvers.find((x: any) => x.id === fast.id);
    const sl = h.solvers.find((x: any) => x.id === slow.id);
    fastPts.push(f.points);
    slowPts.push(sl.points);
    check(`round ${round}: faster guess scored more`, f.points > sl.points && f.ms < sl.ms, `(${f.points} @ ${f.ms}ms vs ${sl.points} @ ${sl.ms}ms)`);
    check(`round ${round}: points inside ${100}-${500}`, f.points <= 500 && sl.points >= 100);
    check(`round ${round}: drawer earned 50 per solver`, h.drawerPoints === 100, `(${h.drawerPoints})`);
    await sleep(500);
  }
  for (let t = 0; t < 60 && dg.pub().stage !== "over"; t++) await sleep(100);
  await sleep(500);
  check("session over after 3 rounds", dg.pub().stage === "over");
  const ranking = dg.sessionRanking();
  const sumOk = ranking.every((r: any) => dg.perRoundOf(r.id).reduce((a: number, b: number) => a + b, 0) === r.total);
  check("round columns add up to each total", sumOk);
  check("session total equals global score (fresh start)", ranking.every((r: any) => r.total === host.players.get(r.id)!.score));
  check("fast guesser total = sum of their 3 round scores", dg.totalOf(fast.id) === fastPts.reduce((a, b) => a + b, 0));
  check("fast guesser outranks slow guesser", ranking.findIndex((r: any) => r.id === fast.id) < ranking.findIndex((r: any) => r.id === slow.id));
  check("ranking sorted high to low", ranking.every((r: any, i: number) => i === 0 || ranking[i - 1].total >= r.total));
  await sleep(300);
  // every phone received a final personal summary that matches the host
  const bad = bots.filter((b) => {
    const rr = b.view.roundResult;
    return !rr || !rr.final || rr.sid !== dg.sid || rr.total !== dg.totalOf(b.id) || rr.perRound.length !== 3 ||
      rr.rank !== ranking.findIndex((r: any) => r.id === b.id) + 1;
  });
  check("all 80 phones received a correct final summary", bad.length === 0, `(${bad.length} wrong)`);
  const pubOver = dg.pub();
  check("public state carries top-10 board", pubOver.board?.length === 10 && pubOver.board[0].total >= pubOver.board[9].total);
  host.endGame();
}

// ---------- HOST SKIPS THE DRAWER ----------
mark("skip");
{
  host.resetScores();
  // only two ready players, so skipping has to start a second lap
  const evens = bots.filter((_, i) => i % 2 === 0);
  evens.slice(2).forEach((b) => (host.players.get(b.id)!.ready = false));
  const readyIds = evens.slice(0, 2).map((b) => b.id);
  host.startGame({ game: "draw", opts: { rounds: 2, seconds: 5, revealMs: 300, prepMs: 0 } });
  await sleep(400);
  const dg = host.game as any;
  const first = dg.pub().drawerId;
  const firstBot = bots.find((b) => b.id === first)!;
  const guesser = bots.find((b) => b.id !== first && !readyIds.includes(b.id))!;
  guesser.guess(firstBot.view.word!.word);
  await sleep(300);
  check("a guess was scored before the skip", host.players.get(guesser.id)!.score >= 100 && dg.pub().solvedCount === 1);
  const roundBefore = dg.pub().round;
  check("skip is accepted while drawing", dg.skipDrawer() === true);
  await sleep(200);
  const p2 = dg.pub();
  check("new drawer is somebody else", p2.drawerId !== first && readyIds.includes(p2.drawerId), `(${first} -> ${p2.drawerId})`);
  check("round number unchanged (skipped round does not count)", p2.round === roundBefore && p2.stage === "draw");
  check("points from the voided round were taken back", host.players.get(guesser.id)!.score === 0 && dg.totalOf(guesser.id) === 0, `(score ${host.players.get(guesser.id)!.score})`);
  check("new round starts clean with full timer", p2.solvedCount === 0 && p2.endsAt - p2.startedAt === 5000);
  const newBot = bots.find((b) => b.id === p2.drawerId)!;
  check("new drawer received a word", !!newBot.view.word && newBot.view.word.round === p2.round);
  check("skip not allowed outside the drawing stage", (() => { const g2 = new (dg.constructor)(host.ctx, { rounds: 1, seconds: 5 }); g2.stage = "reveal"; return g2.skipDrawer() === false; })());
  // finish the game: round 1 (new drawer) then round 2 needs a second lap
  guesser.guess(newBot.view.word!.word);
  await sleep(300);
  for (let t = 0; t < 80 && dg.pub().stage === "draw" && dg.pub().round === 1; t++) await sleep(100);
  for (let t = 0; t < 40 && !(dg.pub().round === 2 && dg.pub().stage === "draw"); t++) await sleep(100);
  const p3 = dg.pub();
  check("round 2 starts with a refilled drawer queue", p3.round === 2 && p3.stage === "draw" && readyIds.includes(p3.drawerId), JSON.stringify({ r: p3.round, s: p3.stage }));
  check("round 2 drawer differs from round 1's", p3.drawerId !== p2.drawerId);
  const sk = dg.skipDrawer();
  await sleep(200);
  check("skipping again in round 2 works and stays on round 2", sk && dg.pub().round === 2 && dg.pub().stage === "draw");
  for (let t = 0; t < 100 && dg.pub().stage !== "over"; t++) await sleep(100);
  check("game finishes with exactly 2 counted rounds", dg.history.length === 2, `(${dg.history.length})`);
  host.endGame();
  evens.forEach((b) => (host.players.get(b.id)!.ready = true));
}

// ---------- PREP: picture + "I'm ready" ----------
mark("prep");
{
  host.resetScores();
  const img = "data:image/jpeg;base64," + "A".repeat(2000);
  host.startGame({ game: "draw", opts: { rounds: 2, seconds: 4, revealMs: 300, prepMs: 1500, customWords: ["alpha|a1"], customOnly: true, images: { alpha: img } } });
  await sleep(500);
  const dg = host.game as any;
  const p1 = dg.pub();
  check("round starts in prep (clock not running)", p1.stage === "prep" && p1.startedAt === 0 && p1.endsAt === 0 && !!p1.prepEndsAt, JSON.stringify({ s: p1.stage }));
  const drawer = bots.find((b) => b.id === p1.drawerId)!;
  check("drawer received word + host picture", drawer.view.word?.word === "alpha" && drawer.view.word?.img === img);
  check("picture not leaked to anyone else", bots.filter((b) => b !== drawer && b.view.word?.round === p1.round).length === 0);
  const other = bots.find((b) => b !== drawer)!;
  other.guess("alpha");
  await sleep(300);
  check("guesses are ignored during prep", dg.pub().solvedCount === 0 && dg.pub().stage === "prep");
  drawer.reroll();
  await sleep(150);
  drawer.reroll();
  await sleep(150);
  check("one re-roll allowed in prep", dg.rerolls === 0);
  drawer.go();
  await sleep(500);
  const p2 = dg.pub();
  check("go starts the clock", p2.stage === "draw" && p2.endsAt - p2.startedAt === 4000 && p2.prepEndsAt === undefined, JSON.stringify({ s: p2.stage }));
  other.guess("alpha");
  await sleep(300);
  check("guessing works after go", dg.pub().solvedCount === 1);
  // let round 1 end by timeout, round 2 should auto-start drawing after prepMs
  for (let t = 0; t < 80 && !(dg.pub().round === 2 && dg.pub().stage === "prep"); t++) await sleep(100);
  check("round 2 begins in prep", dg.pub().round === 2 && dg.pub().stage === "prep");
  for (let t = 0; t < 40 && dg.pub().stage === "prep"; t++) await sleep(100);
  check("prep auto-starts drawing when time runs out", dg.pub().stage === "draw");
  // skip works in prep too
  for (let t = 0; t < 80 && dg.pub().stage !== "over"; t++) await sleep(100);
  host.endGame();
  host.startGame({ game: "draw", opts: { rounds: 1, seconds: 4, revealMs: 300, prepMs: 5000 } });
  await sleep(300);
  const d2 = host.game as any;
  const first = d2.pub().drawerId;
  const fb = bots.find((b) => b.id === first)!;
  check("built-in words come with an emoji picture", !!fb.view.word?.emoji && !fb.view.word?.img);
  check("skip allowed during prep", d2.skipDrawer() === true);
  await sleep(200);
  check("skip in prep picks someone else and stays in prep", d2.pub().drawerId !== first && d2.pub().stage === "prep" && d2.pub().round === 1);
  host.endGame();
}

// ---------- BINGO ----------
mark("bingo");
{
  host.resetScores();
  host.startGame({ game: "bingo", opts: { intervalMs: 60, pattern: "line", maxWinners: 3 } });
  await sleep(400);
  check("every player got a bingo card", bots.every((b) => b.view.card && b.view.card.length === 5));
  const card = bots[0].view.card!;
  const flat = card.flat().filter((n) => n !== 0);
  check("card has 24 unique numbers", new Set(flat).size === 24);
  check("centre is free", card[2][2] === 0);
  let colsOk = true;
  for (let c = 0; c < 5; c++)
    for (let r = 0; r < 5; r++) {
      const n = card[r][c];
      if (n !== 0 && !(n > c * 15 && n <= (c + 1) * 15)) colsOk = false;
    }
  check("columns follow B-I-N-G-O ranges", colsOk);
  // a false claim is rejected and locked
  const early = bots[1];
  early.claim();
  await sleep(100);
  check("early/false claim rejected", early.view.claim?.ok === false, `(${early.view.claim?.msg})`);
  // bots auto-claim whenever their card has a line
  const g = host.game as any;
  const lastClaim = new Map<string, number>();
  const timer = setInterval(() => {
    const called = new Set<number>(g.called);
    bots.forEach((b) => {
      if (b.view.card && hasWin(b.view.card, called, "line") && Date.now() - (lastClaim.get(b.id) ?? 0) > 2000) {
        lastClaim.set(b.id, Date.now());
        b.claim();
      }
    });
  }, 40);
  for (let t = 0; t < 400 && g.pub().stage !== "over"; t++) await sleep(50);
  clearInterval(timer);
  await sleep(200);
  check("bingo ended with 3 winners", g.winners.length === 3, `(${g.winners.length}, called ${g.called.length} numbers)`);
  const winnerCard = (id: string) => g.cards.get(id);
  check(
    "all winners hold a genuine line",
    g.winners.every((w: any) => hasWin(winnerCard(w.id), new Set(g.called), "line"))
  );
  const scores = g.winners.map((w: any) => host.players.get(w.id)!.score);
  check("prizes 300/200/100", scores[0] === 300 && scores[1] === 200 && scores[2] === 100, JSON.stringify(scores));
  host.endGame();
}

// ---------- FINGER RACE ----------
mark("race");
let raceFrom = 0;
let raceTo = 0;
{
  host.resetScores();
  raceFrom = bus.perSecond.length;
  host.startGame({ game: "race", opts: { target: 40, seconds: 12, countdownMs: 500, finishCap: 5 } });
  await sleep(700);
  const rg = host.game as any;
  check("race running", rg.pub().stage === "run");
  const stepsSent = bots.map(() => 0);
  const speeds = bots.map((_, i) => 4 + (i % 10)); // steps per second
  const t0 = Date.now();
  const tm = setInterval(() => {
    const el = (Date.now() - t0) / 1000;
    bots.forEach((b, i) => {
      const n = Math.min(40, Math.floor(el * speeds[i]));
      if (n !== stepsSent[i]) {
        stepsSent[i] = n;
        b.steps(n);
      }
    });
  }, 700); // each bot sends at most ~1.4 msg/s (same as the phone UI)
  // a cheater claims instant finish
  bots[79].steps(40);
  await sleep(100);
  check("impossible instant finish clamped", (rg.steps.get("bot-79") ?? 0) <= 8, `(${rg.steps.get("bot-79")})`);
  for (let t = 0; t < 200 && rg.pub().stage !== "over"; t++) await sleep(100);
  clearInterval(tm);
  await sleep(200);
  check("race ended", rg.pub().stage === "over");
  raceTo = bus.perSecond.length;
  check("at least 5 finishers", rg.finished.length >= 5, `(${rg.finished.length})`);
  const first = host.players.get(rg.finished[0].id)!;
  check("first finisher gets 300", first.score === 300, `(${first.score})`);
  host.endGame();
}

// ---------- LOAD ----------
mark("end");
for (let i = 0; i < marks.length - 1; i++) {
  const seg = bus.perSecond.slice(marks[i].idx, marks[i + 1].idx).map((x) => x.published + x.delivered);
  console.log(`phase ${marks[i].name.padEnd(12)} seconds: ${seg.join(" ")}  peak ${Math.max(0, ...seg)}`);
}
console.log("per-second (pub+deliv):", bus.perSecond.map((s) => s.published + "+" + s.delivered).join(" "));
const peak = bus.perSecond.reduce((m, s) => Math.max(m, s.published + s.delivered), 0);
const peakPub = bus.perSecond.reduce((m, s) => Math.max(m, s.published), 0);
console.log(`\nbus load: peak ${peak} msgs/s (published+delivered; Ably free limit 500/s), peak publishes ${peakPub}/s, total ${bus.published} pub / ${bus.delivered} delivered`);
const racePeak = bus.perSecond.slice(raceFrom + 1, raceTo).reduce((m, s) => Math.max(m, s.published + s.delivered), 0);
check("finger race (80 runners) stays under Ably free 500 msgs/s", racePeak < 500, `(peak ${racePeak})`);
console.log("note: short spikes above 500/s come from this test making all bots guess/claim in the same millisecond.");

bots.forEach((b) => b.close());
host.close();
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
