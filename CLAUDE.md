# GURU — Claude Agent Guide

> Football prediction & trivia app. Read this before making any changes.

## Project overview

**GURU** is a mobile-first Next.js football fan engagement app. Core hierarchy:
1. **Match Predictions** (primary) — community prediction trends + pre-game / halftime prediction cards for UCL, Premier League, La Liga
2. **Trivia mode** (secondary) — timed Q&A questions about football history, players, and matches

**Stack:** Next.js 14 (App Router), TypeScript, Tailwind CSS, Supabase, Anthropic SDK, Framer Motion  
**Deployment:** Vercel  
**Live URL:** https://gurutrivia.vercel.app (or similar)

---

## Design system

All UI must follow `DESIGN.md` at the root. Key rules:

| Token | Value |
|-------|-------|
| Background | `#000000` (pure black — never lighten) |
| Primary text | `#f0f0f0` |
| Secondary text | `#a1a4a5` |
| Muted text | `#464a4d` |
| Frost border | `rgba(214, 235, 253, 0.19)` — ALL borders use this, never gray |
| Green accent | `#11ff99` |
| Yellow accent | `#ffc53d` |
| Red accent | `#ff2047` |
| Card bg | `bg-white/[0.03]` |
| Card radius | `rounded-2xl` (16px) |

**Typography** (loaded via `app/layout.tsx`):
- Hero headlines: ABC Favorit / Domaine Display
- Body & UI: Inter
- Code: Commit Mono

**Never** use neutral gray borders. **Always** use `border-[rgba(214,235,253,0.19)]` or Tailwind shorthand `border-white/[0.06]`.

---

## File structure

```
app/
  page.tsx              — Home (tabs: Predict ★, My Picks, Ranks, Trivia)
  play/page.tsx         — Trivia game screen
  live/page.tsx         — Simulated in-game prediction engine (old)
  matches/page.tsx      — Match browser
  leaderboard/page.tsx  — Global rankings
  profile/page.tsx      — User profile
  predict/[matchId]/    — NEW: Match prediction flow (pre-game + halftime)
    page.tsx
  auth/
    login/page.tsx
    error/page.tsx
  api/
    matches/
      route.ts          — GET ?filter=live|upcoming
      live-score/route.ts — ESPN live score proxy
      sync/route.ts     — Cron sync from football-data.org
    predictions/
      generate/route.ts — NEW: Claude-powered prediction generation
    questions/route.ts
    game/submit/route.ts
    leaderboard/route.ts
    profile/route.ts

components/
  ui/
    MatchCard.tsx       — Match card used on home + matches pages
    LivesDisplay.tsx
  layout/
    BottomNav.tsx

hooks/
  useAuth.ts
  useGame.ts
  useLanguage.ts
  useLeaderboardRealtime.ts

lib/
  sports-data.ts        — ESPN + football-data.org fetch helpers
  questions.ts          — Trivia question generation (Anthropic)
  scoring.ts, lives.ts, difficulty.ts, matches.ts, i18n.ts

types/
  index.ts              — Core types (Match, Question, Profile, etc.)
  predictions.ts        — NEW: MatchPrediction, PredictionPhase types
```

---

## Data sources

| Source | Usage | Auth |
|--------|-------|------|
| ESPN public API | Live match scores, goals, cards, match status | None (public) |
| football-data.org | League standings, top scorers (pre-game context) | `FOOTBALL_DATA_API_KEY` |
| Anthropic Claude | Generate trivia questions + match predictions | `ANTHROPIC_API_KEY` |
| Supabase | User profiles, points, answers, leaderboard | `NEXT_PUBLIC_SUPABASE_*` |

**ESPN event IDs** are stored in our match IDs as `espn-{eventId}` (e.g., `espn-726294`).  
The live-score API strips the prefix: `espnId = matchId.replace('espn-', '')`.

---

## Home page UX (predictions-first)

The home page tab order reflects product priority:
1. **Predict** (default) — today's matches from UCL + Premier League + La Liga, each showing community prediction bars when the user hasn't predicted yet
2. **My Picks** — saved prediction sessions from `localStorage`
3. **Ranks** — leaderboard teaser with fake users for FOMO
4. **Trivia** — demoted; visually muted (lower opacity, "Secondary" badge)

### Community prediction bars (`components/ui/MatchCard.tsx`)
Shown on every scheduled match card where the user has no saved prediction.  
- 3 bars: Home Win (green), Draw (gray), Away Win (yellow)  
- Leading option is highlighted bold  
- Numbers come from `lib/fake-data.ts → getCommunityPrediction(matchId)` — deterministic hash so the same match always shows the same numbers
- Fan count (e.g., "3,241 fans") also from fake-data

### Fake users (`lib/fake-data.ts`)
- `getCommunityPrediction(matchId)` — stable fake percentages for community trend bars
- `FAKE_LEADERBOARD_USERS` — 20 fake users with realistic names, countries, and points
- Global leaderboard always shows these; if the real user has points they're spliced in at the right rank

### Featured leagues
Home page shows only `["uefa.champions", "eng.1", "esp.1"]` (Champions League, Premier League, La Liga). Configured in `lib/matches.ts → HOME_LEAGUES`. Matches are fetched without a league filter then filtered client-side using league name string matching.

---

## Match Predictions feature (`/predict/[matchId]`)

### User journey
1. **Pre-game** — User sees 5–8 Claude-generated predictions for the first half. They tap Yes/No (or multi-option) for each. Community vote bars (Polymarket-style) animate in after answering.
2. **Live (1st half)** — Minimal waiting screen with real-time score. Predictions are locked.
3. **Half time** — Score summary, simulated rank vs community, 5–8 new predictions for the second half.
4. **Live (2nd half)** — Same minimal waiting screen.
5. **Full time** — Final results with correct/incorrect per prediction, total pts, share card.

### Phase detection
Poll `/api/matches/live-score?id={matchId}` every 30s. Map `statusDetail` from ESPN:
- `"Scheduled"` or `status === 'scheduled'` → `pregame`
- `status === 'live'` and `period === 1` and not halftime → `live_first_half`
- `statusDetail` includes `"Half Time"` → `halftime`
- `status === 'live'` and `period === 2` → `live_second_half`
- `status === 'finished'` → `fulltime`

### Prediction generation (Claude)
`POST /api/predictions/generate` takes `{ matchId, homeTeam, awayTeam, league, phase }`.  
Returns `MatchPrediction[]`. Each prediction has:
- `question`: Specific to this match (uses player names, team context)
- `options`: 2–3 choices
- `simulatedVotes`: Fake community percentages that look realistic
- `resolutionHint`: For future auto-resolution (e.g., `"home_team_scores_period_1"`)

### Scoring
- 100 pts per correct prediction (revealed after match ends)
- Contrarian bonus: +50 pts if you picked against the majority and were right
- Answers and scores stored in `localStorage` keyed by `matchId` (no Supabase for now)

### Community votes
Simulated — realistic-looking distributions generated at question-creation time.  
Bars animate in after user answers. Updated with small jitter every 10s to feel live.

---

## Environment variables

```bash
NEXT_PUBLIC_SUPABASE_URL=          # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=     # Supabase anon key (client-safe)
SUPABASE_SERVICE_ROLE_KEY=         # Server-only
ANTHROPIC_API_KEY=                 # Claude API
FOOTBALL_DATA_API_KEY=             # football-data.org free tier
CRON_SECRET=                       # Protects /api/matches/sync
```

Copy `.env.local.example` → `.env.local` and fill in values.

---

## Development

```bash
npm run dev          # Start dev server on :3000
npm run build        # Production build
npm run lint         # ESLint
npm run generate-questions  # Seed trivia questions via Claude
```

---

## Key conventions

- **All pages are `"use client"` by default** — this is a highly interactive mobile app
- **Framer Motion** for page transitions and micro-animations
- **No default shadows** — depth comes from frost borders only (see DESIGN.md §6)
- **Bottom nav** (`<BottomNav />`) is included in every main page
- **`useAuth()`** hook provides `isLoggedIn`, `user`, `avatarUrl`
- **`useLanguage()`** hook provides `t(key)` for i18n (EN/ES/FR/DE/PT)
- Match IDs follow `espn-{number}` format when sourced from ESPN
- API routes use `NextResponse.json()` — no raw `Response` objects

---

## Branch strategy

- `main` — stable, deployed to production
- `feature/match-predictions` — new prediction flow (this feature)
- `claude/*` — Claude Code worktree branches (auto-created, ephemeral)

Never force-push to `main`. Prediction feature merges via PR when ready.
