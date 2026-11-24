# Party Games 🎉

Three realtime party games for a shared screen + up to ~80 phones. React + TypeScript, deploys free on Vercel.

| Game | How it plays |
| --- | --- |
| 🎨 **Draw & Guess** | A random **ready** player is picked to draw a secret word on their phone. The drawing appears on the big screen; everyone else types guesses on their phones. Faster guesses earn more points, hints appear as time runs out. Thai words accept the English answer too. |
| 🎱 **Bingo** | Every phone gets its own random 5×5 card. Numbers (1–75) are called automatically; tap to mark, press BINGO. The host verifies the claim (false claims are locked out for 8 s). First 3 winners score 300/200/100. Win by any line or full card. |
| 🏃 **Finger Race** | Alternate left/right thumbs as fast as you can. Steps are rate-limited on the host so tap-bots can't cheat. First finishers win 300/200/100. |

## How it works

Vercel only serves static files and one tiny serverless function, so realtime goes through **Ably** (free: 200 connections, 500 msg/s, 6M msgs/month).

```
phones ──publish──▶ opl:ROOM:in:0..7  ──▶ host screen (referee: runs all game logic in the browser)
phones ◀──────────── opl:ROOM:state      ◀── small public snapshot, max every 0.4–2 s
phones ◀──────────── opl:ROOM:p:<id>     ◀── private: your word / bingo card / results
```

* `src/engine/` – pure game logic (draw, bingo, race) running on the host screen.
* `src/lib/client.ts` – phone-side protocol client (also used by the load-test bots).
* `api/ably-token.ts` – Vercel function that mints short-lived Ably tokens (the API key never reaches browsers).
* The drawing is shown **only on the host screen** and strokes go only to the host – phones never receive strokes, which keeps 80 players inside the free message budget.

## Deploy on Vercel (free)

1. Create a free account at <https://ably.com> → create an app → copy an API key (needs *publish* + *subscribe*).
2. Push this repo to GitHub and import it in Vercel (framework preset: **Vite**; build `npm run build`, output `dist` – auto-detected).
3. In Vercel → Project → Settings → Environment Variables add `ABLY_API_KEY` = your key, then redeploy.
4. Open `https://<your-app>.vercel.app/host` on the big screen/projector, players scan the QR code.

Without `ABLY_API_KEY` the app falls back to **demo mode** (BroadcastChannel – only tabs of the same browser), which is handy for trying it locally.

## Develop

```bash
npm install
npm run dev              # http://localhost:5173/host?local=1  and  /play?room=XXXX&local=1&pid=a
npm run typecheck
npm run simulate         # 80 simulated phones play all three games against the engine
```

## Notes & limits

* The host browser tab is the referee – keep it open (it can reload; players reconnect automatically but the running round resets).
* Anyone who inspects the network could publish as host; fine for a party, not for money games.
* Game-by-game message budget (80 phones): idle lobby ≈ 80 msg/s, finger race peaks ≈ 370 msg/s in simulation, bursts above 500 msg/s are throttled by Ably, not dropped permanently.
