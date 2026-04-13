# Second Screen — Live Prediction Game

A fast, real-time micro-prediction backend for **Atletico Madrid vs Barcelona**.

Users answer short in-match predictions ("Will there be a shot in the next 2 minutes?") and earn points based on speed and streaks. Not trivia. Not betting. Just reading the game better than your friends.

---

## Architecture

```
second-screen/
├── src/
│   ├── app.ts               # Express app
│   ├── server.ts            # Entry point
│   ├── config/
│   │   └── index.ts         # Env config
│   ├── types/
│   │   └── index.ts         # All TypeScript interfaces
│   ├── clients/
│   │   └── espnClient.ts    # ESPN API (raw data, isolated)
│   ├── engines/
│   │   ├── matchNormalizer.ts    # ESPN raw → NormalizedMatchState
│   │   ├── predictionEngine.ts  # Generate rule-based predictions
│   │   ├── resolutionEngine.ts  # Resolve predictions from events
│   │   ├── scoringEngine.ts     # Points + leaderboard
│   │   └── simulationEngine.ts  # Inject mock events for local testing
│   ├── routes/
│   │   └── matchRoutes.ts   # Express routes
│   ├── store/
│   │   └── matchStore.ts    # In-memory state (swap for Redis later)
│   ├── mocks/
│   │   └── scenarios.ts     # Predefined Atletico vs Barça scenarios
│   └── utils/
│       └── logger.ts
├── .env.example
├── package.json
└── tsconfig.json
```

### Data flow per tick

```
POST /tick
  ↓
espnClient.fetchMatch()   (or mock advance)
  ↓
matchNormalizer()         → NormalizedMatchState
  ↓
resolutionEngine()        → resolve active predictions
  ↓
scoringEngine()           → score newly resolved predictions
  ↓
predictionEngine()        → maybe generate a new prediction
```

---

## Setup

```bash
cd second-screen
npm install
cp .env.example .env
```

---

## Running

### Mock mode (no ESPN needed)

```bash
npm run dev:mock
```

This starts the server at `http://localhost:3001` with `USE_MOCKS=true`. The match state is entirely simulated — each `POST /tick` advances the match by 1 minute. Use `simulate-scenario` and `simulate-event` to inject events.

### Live mode (ESPN)

1. Find the ESPN event ID for the match. Open espn.com, go to the match, grab the ID from the URL (e.g. `espn.com/soccer/match/_/gameId/706767` → ID is `706767`).
2. Set in `.env`:
   ```
   USE_MOCKS=false
   ESPN_MATCH_ID=706767
   ESPN_LEAGUE=esp.1
   ```
3. Start:
   ```bash
   npm run dev
   ```

---

## API Reference

All routes are under `/api/match/:id`.

In mock mode, use any string as `:id` (e.g. `atl-bar-2026`).  
In live mode, `:id` should match your `ESPN_MATCH_ID`.

---

### `GET /health`

```json
{ "status": "ok", "timestamp": "..." }
```

---

### `GET /api/match/:id/state`

Returns the current normalized match state.

```json
{
  "matchId": "atl-bar-2026",
  "competition": "La Liga",
  "status": "live",
  "minute": 34,
  "period": 1,
  "homeTeam": { "id": "atletico-madrid", "name": "Atletico Madrid", "shortName": "ATL", "score": 0 },
  "awayTeam": { "id": "barcelona", "name": "Barcelona", "shortName": "BAR", "score": 1 },
  "stats": { "homeCorners": 2, "awayCorners": 4, "homeShots": 3, "awayShots": 8 },
  "recentEvents": [...],
  "lastUpdatedAt": "..."
}
```

---

### `GET /api/match/:id/predictions/active`

Returns only predictions users can currently answer.

```json
{
  "count": 1,
  "predictions": [{
    "id": "abc-123",
    "templateType": "shot_next_2m",
    "text": "Will there be a shot in the next 2 minutes?",
    "options": [
      { "id": "yes", "label": "Yes" },
      { "id": "no", "label": "No" }
    ],
    "status": "active",
    "lockAt": "...",
    "resolveBy": "...",
    "confidence": 0.72
  }]
}
```

---

### `POST /api/match/:id/predictions/:predictionId/answer`

Record a user's answer. Only accepted while prediction is `active`.

**Body:**
```json
{ "userId": "player-1", "optionId": "yes" }
```

**Response:**
```json
{ "message": "Answer recorded", "answer": { ... } }
```

**Errors:**
- `400` — missing fields or invalid optionId
- `409` — prediction not active, or user already answered

---

### `GET /api/match/:id/leaderboard`

```json
{
  "leaderboard": [
    { "userId": "player-1", "points": 35, "correct": 3, "incorrect": 1, "streak": 2 },
    { "userId": "player-2", "points": 20, "correct": 2, "incorrect": 0, "streak": 2 }
  ]
}
```

---

### `POST /api/match/:id/tick`

Advances one engine cycle. Call this on a timer (every 10–15s) or manually.

```json
{
  "matchId": "atl-bar-2026",
  "minute": 35,
  "status": "live",
  "score": "ATL 0–1 BAR",
  "newEvents": 2,
  "activePredictions": 1,
  "log": [
    "Tick: advanced to minute 35",
    "New events: 2",
    "Generated: \"Will there be a shot in the next 2 minutes?\" [shot_next_2m] confidence=0.70"
  ]
}
```

---

### `POST /api/match/:id/simulate-event`

Inject a single event (mock mode).

**Body:**
```json
{
  "type": "corner",
  "teamSide": "away",
  "minute": 34,
  "playerName": "Raphinha"
}
```

Valid types: `shot`, `shot_on_target`, `corner`, `foul`, `yellow_card`, `red_card`, `goal`, `substitution`, `period_start`, `period_end`, `other`

---

### `POST /api/match/:id/simulate-scenario`

Apply a predefined event sequence.

**Body:**
```json
{ "scenario": "barcelona_pressure" }
```

Available scenarios:
| Key | Description |
|-----|-------------|
| `quiet_opening` | Slow start, minimal action |
| `barcelona_pressure` | Shots and corners from Barça |
| `atletico_foul_streak` | Fouls → yellow cards from Atleti |
| `consecutive_corners` | Corner exchange from both teams |
| `goal_after_pressure` | Build-up pressure → goal |
| `atletico_counter` | Atleti counter-attack → goal |

---

### `GET /api/match/:id/scenarios`

Lists all available scenarios with descriptions.

---

## Example: Full mock session

```bash
ID="atl-bar-2026"
BASE="http://localhost:3001/api/match/$ID"

# 1. Initialize match and advance state
curl -s -X POST $BASE/tick | jq .

# 2. Inject a pressure spell
curl -s -X POST $BASE/simulate-scenario \
  -H "Content-Type: application/json" \
  -d '{"scenario":"barcelona_pressure"}' | jq .

# 3. Tick to trigger prediction generation
curl -s -X POST $BASE/tick | jq .

# 4. See active predictions
curl -s $BASE/predictions/active | jq .

# 5. Submit answers (grab predictionId from step 4)
curl -s -X POST $BASE/predictions/<predictionId>/answer \
  -H "Content-Type: application/json" \
  -d '{"userId":"player-1","optionId":"yes"}' | jq .

curl -s -X POST $BASE/predictions/<predictionId>/answer \
  -H "Content-Type: application/json" \
  -d '{"userId":"player-2","optionId":"no"}' | jq .

# 6. Tick a few times to let predictions resolve
curl -s -X POST $BASE/tick | jq .

# 7. Check leaderboard
curl -s $BASE/leaderboard | jq .

# 8. Check full prediction history
curl -s $BASE/predictions | jq '.predictions[] | {type: .templateType, status: .status, result: .resultOptionId}'
```

---

## Prediction rules summary

| Question | Lock after | Resolve by | Resolves to |
|----------|-----------|------------|-------------|
| Will there be a shot in the next 2 min? | 30s | 2 min | `yes` on any shot, else `no` |
| Which team takes the next corner? | 30s | 3 min | `home`/`away` on first corner, else `no_corner` |
| Will there be a foul in the next 60s? | 20s | 60s | `yes` on any foul, else `no` |
| Which team gets the next yellow card? | 30s | 5 min | `home`/`away` on first yellow, else `no_card` |

**Max 2 active predictions at once.** Cadence: 45s (high intensity) → 90s (low).

---

## Scoring

- Correct: **10 points × streak multiplier**
- Wrong: 0 points, streak resets

| Streak | Multiplier |
|--------|-----------|
| 0–1 | ×1 |
| 2 | ×1.5 |
| 3 | ×2 |
| 4 | ×2.5 |
| 5+ | ×3 |

---

## v2 ideas

- **Polling loop** — auto-tick on a timer instead of manual POST
- **Redis store** — replace in-memory store with Redis for multi-server support
- **WebSocket push** — push new predictions and results to clients in real time
- **Supabase persistence** — store results, answers, leaderboard across sessions
- **More question types** — next substitution team, next throw-in team, next goalkeeper save
- **Per-player stats page** — prediction history, accuracy rate, best streak
- **Late-join catch-up** — show resolved predictions to users who join mid-match
- **Confidence calibration** — track historical confidence vs accuracy and tune thresholds
- **Multi-match support** — generalize away from single-match hardcoding
