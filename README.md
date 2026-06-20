# Hold'em — Online Texas Hold'em Poker

A fully playable, multiplayer **Texas Hold'em** poker game for up to **10 players**.
Create a table, share the room code, and everyone joins from their own phone or
laptop. Built with **Next.js (App Router)** and deployable to **Vercel** in a
couple of minutes.

![table](https://img.shields.io/badge/players-2--10-emerald) ![stack](https://img.shields.io/badge/Next.js-16-black)

## Features

- ♠️ Full Texas Hold'em rules: blinds, pre-flop/flop/turn/river betting, showdown
- 👥 2–10 players, each on their own device, joined by a 4-letter room code
- 🔒 Hole cards are dealt and stored **server-side** — opponents can't peek
- 💰 Correct pot logic including **all-ins and side pots**
- ⏱️ Per-turn timer that auto-checks/folds players who go AFK
- 🪑 Dealer button rotation, heads-up rules, busting & sitting out
- 🔄 Real-time updates via lightweight polling (works on Vercel serverless)
- 📱 Responsive table UI that works on mobile and desktop

## How it plays

1. One person **creates a table** (they're the host) and picks the starting
   stack and blinds.
2. Everyone else **joins with the room code** (or the invite link).
3. The host clicks **Deal first hand**. Action proceeds around the table.
4. After each hand the next one is dealt automatically (the host can also deal
   immediately).

## Tech

| Concern            | Choice                                            |
| ------------------ | ------------------------------------------------- |
| Framework          | Next.js 16 (App Router) + React 19                |
| Styling            | Tailwind CSS                                       |
| Game state storage | Upstash Redis (serverless REST) with locking      |
| Real-time          | Client polling (~1.8s) against API routes         |
| Hand evaluation    | Custom 7-card evaluator (`src/lib/poker`)         |

All poker rules live in `src/lib/poker/` (`engine.ts`, `evaluator.ts`,
`cards.ts`) and are covered by a simulation test (`npm test`).

## Local development

```bash
npm install
npm run dev
# open http://localhost:3000
```

> Without Upstash credentials the app uses an **in-memory store** so you can try
> it locally with a single `npm run dev`. That only works for one server
> process and resets on restart — set up Upstash for real multiplayer / Vercel.

Run the rules test suite:

```bash
npm test
```

## Deploy to Vercel

### 1. Create a free Upstash Redis database

Vercel's serverless functions are stateless, so game state lives in Redis.

1. Go to <https://console.upstash.com/> and create a free **Redis** database.
2. Open the database → **REST API** section and copy:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

(Tip: you can also add the **Upstash** integration directly from the Vercel
Marketplace, which injects these env vars for you.)

### 2. Deploy

Push this folder to a Git repo and import it at <https://vercel.com/new>, or use
the CLI:

```bash
npm i -g vercel
vercel            # follow the prompts
vercel env add UPSTASH_REDIS_REST_URL
vercel env add UPSTASH_REDIS_REST_TOKEN
vercel --prod
```

Set the two environment variables in **Vercel → Project → Settings →
Environment Variables** (or via the CLI above), then redeploy. That's it — share
your deployed URL and start a table.

## Project layout

```
src/
  app/
    page.tsx                 # home: create / join a table
    room/[code]/page.tsx     # the poker table (polls + renders)
    api/room/...             # create, join, state, start, action, next, leave
  components/                # PlayingCard, PlayerSeat, CommunityBoard, ActionControls
  lib/
    poker/engine.ts          # game state machine & betting logic
    poker/evaluator.ts       # 5/7-card hand ranking
    poker/serialize.ts       # strips secrets per viewer
    store.ts                 # Upstash Redis (+ in-memory fallback) & room locking
    client.ts                # browser API client + identity
scripts/sim.ts               # engine test suite (npm test)
```

## Notes & limitations

- Real-time updates use polling, which is the reliable choice on Vercel's
  serverless platform (no persistent WebSocket). Expect ~2s latency on actions.
- This is a play-money game with no authentication beyond a per-table secret
  token stored in your browser. Don't use it for anything with real stakes.
- Rooms expire from Redis after 12 hours of inactivity.
