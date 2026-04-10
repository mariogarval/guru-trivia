# GURU — World Cup 2026 Trivia

## Quick Setup (< 30 minutes)

### 1. Install dependencies
```bash
npm install
```

### 2. Supabase
1. Create a project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run the contents of `lib/supabase/schema.sql`
3. Go to **Authentication → Providers** and enable **Google**
   - Add your Google OAuth credentials (from [console.developers.google.com](https://console.developers.google.com))
   - Set redirect URL: `https://your-project-id.supabase.co/auth/v1/callback`
4. Copy your project URL and anon key from **Settings → API**

### 3. Environment variables
```bash
cp .env.local.example .env.local
# Fill in all values in .env.local
```

### 4. Generate questions
```bash
npm run generate-questions
```
This calls Claude Opus 4.6 to generate 100+ trivia questions and stores them in Supabase.
Make sure `ANTHROPIC_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are set.

### 5. Run locally
```bash
npm run dev
# Open http://localhost:3000
```

### 6. Deploy to Vercel
```bash
npx vercel deploy
```
Set all environment variables in the Vercel dashboard under **Settings → Environment Variables**.

The `vercel.json` cron job automatically calls `/api/matches/sync` every minute to keep live match data updated.

---

## Architecture Overview

```
app/
├── page.tsx              # Home: live matches, quick play, stats
├── play/page.tsx         # Game screen with timer, answers, feedback
├── leaderboard/page.tsx  # Global / country / friends tabs
├── matches/page.tsx      # Match browser
├── profile/page.tsx      # Stats, badges, settings
└── api/
    ├── questions/        # Serve questions (excludes answered)
    ├── game/submit/      # Validate answers, award points, deduct lives
    ├── game/lives/       # Lives status with auto-regen
    ├── matches/          # Match list + sync cron endpoint
    ├── leaderboard/      # Rankings (global / country / league)
    ├── leagues/          # Create / join friend leagues
    └── profile/          # User stats and settings

lib/
├── questions.ts          # Claude API question generation
├── scoring.ts            # Points, speed bonuses, streak bonuses
├── lives.ts              # Lives regeneration logic
├── difficulty.ts         # Dynamic difficulty based on accuracy
└── matches.ts            # football-data.org API sync

hooks/
├── useGame.ts            # Game state machine
└── useLeaderboardRealtime.ts  # Supabase Realtime subscription
```

## Key Design Decisions

- **Server-side answer validation**: `correct_answer_index` is never sent to the client until after submission. The `/api/game/submit` endpoint validates answers server-side.
- **Guest mode**: Questions are served without requiring login. Progress is local-only until sign-in.
- **Claude Opus 4.6 + adaptive thinking**: Question generation uses streaming with adaptive thinking for high-quality, varied questions.
- **Lives regen**: Calculated on-demand (not stored as scheduled jobs) to avoid drift.
- **Supabase Realtime**: Leaderboard updates pushed to clients without polling.

## Phases Roadmap

- **Phase 1 (MVP)**: Auth, questions, timer, scoring, lives, basic leaderboard ✅
- **Phase 2**: Match integration, halftime modes, country leaderboards, friend leagues
- **Phase 3**: Multilingual, badges, sharing, animations polish
- **Phase 4**: Stripe monetization for lives purchases
