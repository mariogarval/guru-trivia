"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

type Side = "home" | "away";
type EventType =
  | "shot"
  | "shot_on_target"
  | "corner"
  | "foul"
  | "yellow_card"
  | "red_card"
  | "goal";
type Template =
  | "shot_next_2m"
  | "next_corner_team"
  | "foul_next_60s"
  | "next_yellow_team";
type PredStatus = "active" | "locked" | "resolved" | "expired";

type GameEvent = {
  id: string;
  type: EventType;
  side: Side;
  minute: number;
  ts: number;
  label: string;
};

type Option = { id: string; label: string };

type Prediction = {
  id: string;
  template: Template;
  text: string;
  options: Option[];
  createdTs: number;
  lockTs: number;
  resolveTs: number;
  status: PredStatus;
  confidence: number;
  resultId?: string;
  resultReason?: string;
};

type Score = {
  points: number;
  streak: number;
  correct: number;
  incorrect: number;
};

// ─── Config ───────────────────────────────────────────────────────────────────

const HOME = { name: "Atletico Madrid", short: "ATL" };
const AWAY = { name: "Barcelona", short: "BAR" };

const TICK_MS = 3_000; // 3s real = 1 match minute
const LOCK_MS = 16_000;
const RESOLVE_MS: Record<Template, number> = {
  shot_next_2m: 38_000,
  next_corner_team: 58_000,
  foul_next_60s: 30_000,
  next_yellow_team: 85_000,
};
const CADENCE: Record<string, number> = {
  high: 20_000,
  medium: 28_000,
  low: 45_000,
};
const STREAK_MULT = [1, 1, 1.5, 2, 2.5, 3];

// ─── Pure game logic ──────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function streakMult(streak: number) {
  return STREAK_MULT[Math.min(streak, STREAK_MULT.length - 1)] ?? 1;
}

function calcIntensity(events: GameEvent[], minute: number) {
  const recent = events.filter((e) => e.minute >= minute - 5);
  let s = 0;
  for (const e of recent) {
    if (e.type === "shot_on_target") s += 3;
    else if (e.type === "shot") s += 2;
    else if (e.type === "goal") s += 2;
    else if (e.type === "corner") s += 1.5;
    else if (e.type === "yellow_card") s += 2;
    else if (e.type === "red_card") s += 3;
    else if (e.type === "foul") s += 1;
  }
  if (s >= 8) return "high";
  if (s >= 3) return "medium";
  return "low";
}

const EVENT_LABELS: Record<EventType, string> = {
  shot: "Shot",
  shot_on_target: "Shot on target",
  corner: "Corner",
  foul: "Foul",
  yellow_card: "Yellow card",
  red_card: "Red card",
  goal: "GOAL",
};

function mkEvent(
  type: EventType,
  side: Side,
  minute: number,
  player?: string
): GameEvent {
  const team = side === "home" ? HOME.short : AWAY.short;
  return {
    id: uid(),
    type,
    side,
    minute,
    ts: Date.now(),
    label: `${EVENT_LABELS[type]} — ${team}${player ? ` (${player})` : ""}`,
  };
}

function tryGenerate(
  events: GameEvent[],
  minute: number,
  active: Prediction[]
): Prediction | null {
  const now = Date.now();
  const usedTemplates = new Set(active.map((p) => p.template));

  function recent(types: EventType[], mins: number) {
    return events.filter(
      (e) => types.includes(e.type) && e.minute >= minute - mins
    );
  }

  const shots3 = recent(["shot", "shot_on_target"], 3);
  const corners5 = recent(["corner"], 5);
  const fouls5 = recent(["foul"], 5);
  const cards10 = recent(["yellow_card"], 10);
  const pressure3 = recent(["shot", "shot_on_target", "corner"], 3).length;

  function make(
    template: Template,
    text: string,
    options: Option[],
    conf: number
  ): Prediction {
    return {
      id: uid(),
      template,
      text,
      options,
      createdTs: now,
      lockTs: now + LOCK_MS,
      resolveTs: now + RESOLVE_MS[template],
      status: "active",
      confidence: Math.min(conf, 1),
    };
  }

  const candidates: Array<{
    template: Template;
    weight: number;
    build: () => Prediction | null;
  }> = [
    {
      template: "shot_next_2m",
      weight: shots3.length > 0 ? 3 : 1,
      build: () => {
        const c = 0.4 + shots3.length * 0.15 + (calcIntensity(events, minute) === "high" ? 0.2 : 0);
        if (c < 0.45) return null;
        return make("shot_next_2m", "Will there be a shot in the next 2 minutes?", [
          { id: "yes", label: "Yes" },
          { id: "no", label: "No" },
        ], c);
      },
    },
    {
      template: "next_corner_team",
      weight: corners5.length > 0 ? 3 : 1,
      build: () => {
        const c = 0.35 + corners5.length * 0.1 + pressure3 * 0.08;
        if (c < 0.4) return null;
        return make("next_corner_team", "Which team will take the next corner?", [
          { id: "home", label: HOME.short },
          { id: "away", label: AWAY.short },
          { id: "no_corner", label: "No corner" },
        ], c);
      },
    },
    {
      template: "foul_next_60s",
      weight: fouls5.length > 0 ? 2 : 1,
      build: () => {
        const c = 0.3 + fouls5.length * 0.12 + (calcIntensity(events, minute) !== "low" ? 0.1 : 0);
        if (c < 0.4) return null;
        return make("foul_next_60s", "Will there be a foul in the next 60 seconds?", [
          { id: "yes", label: "Yes" },
          { id: "no", label: "No" },
        ], c);
      },
    },
    {
      template: "next_yellow_team",
      weight: cards10.length > 0 || fouls5.length > 1 ? 2 : 0.5,
      build: () => {
        const c = 0.3 + fouls5.length * 0.08 + cards10.length * 0.12;
        if (c < 0.35) return null;
        return make("next_yellow_team", "Which team gets the next yellow card?", [
          { id: "home", label: HOME.short },
          { id: "away", label: AWAY.short },
          { id: "no_card", label: "No card" },
        ], c);
      },
    },
  ];

  const available = candidates
    .filter((c) => !usedTemplates.has(c.template))
    .sort((a, b) => b.weight - a.weight);

  for (const c of available) {
    const p = c.build();
    if (p) return p;
  }
  return null;
}

function resolveAll(
  predictions: Prediction[],
  events: GameEvent[]
): Prediction[] {
  const now = Date.now();
  return predictions.map((p) => {
    if (p.status !== "active" && p.status !== "locked") return p;
    if (p.status === "active" && now > p.lockTs)
      p = { ...p, status: "locked" };

    const post = events.filter((e) => e.ts > p.createdTs);
    const past = now > p.resolveTs;

    switch (p.template) {
      case "shot_next_2m": {
        const hit = post.find(
          (e) => e.type === "shot" || e.type === "shot_on_target"
        );
        if (hit)
          return {
            ...p,
            status: "resolved",
            resultId: "yes",
            resultReason: `Shot at ${hit.minute}'`,
          };
        if (past)
          return {
            ...p,
            status: "resolved",
            resultId: "no",
            resultReason: "No shot in window",
          };
        break;
      }
      case "next_corner_team": {
        const hit = post.find((e) => e.type === "corner");
        if (hit)
          return {
            ...p,
            status: "resolved",
            resultId: hit.side === "home" ? "home" : "away",
            resultReason: `${hit.side === "home" ? HOME.short : AWAY.short} corner at ${hit.minute}'`,
          };
        if (past)
          return {
            ...p,
            status: "resolved",
            resultId: "no_corner",
            resultReason: "No corner in window",
          };
        break;
      }
      case "foul_next_60s": {
        const hit = post.find((e) => e.type === "foul");
        if (hit)
          return {
            ...p,
            status: "resolved",
            resultId: "yes",
            resultReason: `Foul at ${hit.minute}'`,
          };
        if (past)
          return {
            ...p,
            status: "resolved",
            resultId: "no",
            resultReason: "No foul in window",
          };
        break;
      }
      case "next_yellow_team": {
        const hit = post.find((e) => e.type === "yellow_card");
        if (hit)
          return {
            ...p,
            status: "resolved",
            resultId: hit.side === "home" ? "home" : "away",
            resultReason: `Yellow card to ${hit.side === "home" ? HOME.short : AWAY.short} at ${hit.minute}'`,
          };
        if (past)
          return {
            ...p,
            status: "resolved",
            resultId: "no_card",
            resultReason: "No yellow card in window",
          };
        break;
      }
    }

    if (now > p.resolveTs + 15_000) return { ...p, status: "expired" };
    return p;
  });
}

// ─── Scenarios ────────────────────────────────────────────────────────────────

type SE = {
  offset: number;
  type: EventType;
  side: Side;
  player?: string;
};

const SCENARIOS: Record<
  string,
  { label: string; emoji: string; events: SE[] }
> = {
  barcelona_pressure: {
    label: "Barça Pressure",
    emoji: "🔵",
    events: [
      { offset: 0, type: "shot", side: "away", player: "Pedri" },
      { offset: 0, type: "corner", side: "away" },
      { offset: 1, type: "shot_on_target", side: "away", player: "Lewandowski" },
      { offset: 1, type: "corner", side: "away" },
      { offset: 2, type: "foul", side: "home", player: "Koke" },
    ],
  },
  atletico_fouls: {
    label: "Atleti Rough",
    emoji: "🔴",
    events: [
      { offset: 0, type: "foul", side: "home", player: "Llorente" },
      { offset: 1, type: "foul", side: "home", player: "Witsel" },
      { offset: 1, type: "yellow_card", side: "home", player: "Witsel" },
      { offset: 2, type: "foul", side: "away", player: "Gavi" },
    ],
  },
  corner_fest: {
    label: "Corner Fest",
    emoji: "🚩",
    events: [
      { offset: 0, type: "corner", side: "home" },
      { offset: 1, type: "shot", side: "home", player: "Griezmann" },
      { offset: 1, type: "corner", side: "home" },
      { offset: 2, type: "corner", side: "away" },
    ],
  },
  goal_barca: {
    label: "Barça Goal!",
    emoji: "⚽",
    events: [
      { offset: 0, type: "shot_on_target", side: "away", player: "Raphinha" },
      { offset: 0, type: "goal", side: "away", player: "Raphinha" },
    ],
  },
  goal_atl: {
    label: "Atleti Goal!",
    emoji: "⚽",
    events: [
      {
        offset: 0,
        type: "shot_on_target",
        side: "home",
        player: "Griezmann",
      },
      { offset: 0, type: "goal", side: "home", player: "Griezmann" },
    ],
  },
};

// Random auto-events weighted by type
const AUTO_POOL: Array<{ type: EventType; w: number }> = [
  { type: "foul", w: 30 },
  { type: "shot", w: 25 },
  { type: "corner", w: 18 },
  { type: "shot_on_target", w: 12 },
  { type: "yellow_card", w: 6 },
  { type: "goal", w: 3 },
];

function randomEvent(minute: number): GameEvent {
  const total = AUTO_POOL.reduce((s, e) => s + e.w, 0);
  let r = Math.random() * total;
  for (const e of AUTO_POOL) {
    r -= e.w;
    if (r <= 0) {
      const side: Side = Math.random() < 0.5 ? "home" : "away";
      return mkEvent(e.type, side, minute);
    }
  }
  return mkEvent("foul", "home", minute);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function LivePage() {
  const [started, setStarted] = useState(false);
  const [minute, setMinute] = useState(1);
  const [goals, setGoals] = useState({ home: 0, away: 0 });
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [score, setScore] = useState<Score>({
    points: 0,
    streak: 0,
    correct: 0,
    incorrect: 0,
  });
  const [scoredIds, setScoredIds] = useState<Set<string>>(new Set());
  const [lastGenTs, setLastGenTs] = useState<number | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  // Stable refs so intervals always see fresh state
  const ref = useRef({
    minute,
    events,
    predictions,
    answers,
    score,
    scoredIds,
    lastGenTs,
  });
  ref.current = { minute, events, predictions, answers, score, scoredIds, lastGenTs };

  const addEvents = useCallback((newEvts: GameEvent[]) => {
    setEvents((prev) => [...prev, ...newEvts].slice(-40));
    for (const e of newEvts) {
      if (e.type === "goal") {
        setGoals((g) => ({
          home: e.side === "home" ? g.home + 1 : g.home,
          away: e.side === "away" ? g.away + 1 : g.away,
        }));
      }
    }
  }, []);

  // Seed initial events on start
  useEffect(() => {
    if (!started) return;
    addEvents([
      mkEvent("foul", "home", 2),
      mkEvent("shot", "away", 3),
      mkEvent("corner", "away", 4),
    ]);
  }, [started, addEvents]);

  // Match clock + auto events
  useEffect(() => {
    if (!started) return;
    const t = setInterval(() => {
      const m = ref.current.minute + 1;
      setMinute(m);
      const intensity = calcIntensity(ref.current.events, m);
      const threshold =
        intensity === "high" ? 0.45 : intensity === "medium" ? 0.3 : 0.12;
      if (Math.random() < threshold) addEvents([randomEvent(m)]);
    }, TICK_MS);
    return () => clearInterval(t);
  }, [started, addEvents]);

  // Engine cycle: resolve → score → generate
  useEffect(() => {
    if (!started) return;
    const t = setInterval(() => {
      const { minute: m, events: evts, predictions: preds, answers: ans, score: sc, scoredIds: sid, lastGenTs: lgt } = ref.current;
      const resolved = resolveAll(preds, evts);

      // Score newly resolved
      let newScore = { ...sc };
      let gain = 0;
      const newScoredIds = new Set(sid);

      for (const p of resolved) {
        if (p.status === "resolved" && p.resultId && !sid.has(p.id)) {
          newScoredIds.add(p.id);
          const answer = ans[p.id];
          if (answer !== undefined) {
            if (answer === p.resultId) {
              const pts = Math.round(10 * streakMult(newScore.streak));
              gain += pts;
              newScore = {
                ...newScore,
                points: newScore.points + pts,
                streak: newScore.streak + 1,
                correct: newScore.correct + 1,
              };
            } else {
              newScore = {
                ...newScore,
                streak: 0,
                incorrect: newScore.incorrect + 1,
              };
            }
          }
        }
      }

      if (gain > 0) {
        setFlash(`+${gain}pts!`);
        setTimeout(() => setFlash(null), 2000);
      }

      setPredictions(resolved);
      setScore(newScore);
      setScoredIds(newScoredIds);

      // Generate
      const active = resolved.filter(
        (p) => p.status === "active" || p.status === "locked"
      );
      if (active.length < 2) {
        const intensity = calcIntensity(evts, m);
        const cadence = CADENCE[intensity] ?? 28_000;
        const now = Date.now();
        if (!lgt || now - lgt > cadence) {
          const next = tryGenerate(evts, m, active);
          if (next) {
            setPredictions((prev) => [...prev, next]);
            setLastGenTs(now);
          }
        }
      }
    }, 1_000);
    return () => clearInterval(t);
  }, [started]);

  const submitAnswer = (predId: string, optId: string) => {
    const pred = ref.current.predictions.find((p) => p.id === predId);
    if (!pred || pred.status !== "active" || ref.current.answers[predId])
      return;
    setAnswers((prev) => ({ ...prev, [predId]: optId }));
  };

  const runScenario = (key: string) => {
    const s = SCENARIOS[key];
    if (!s) return;
    const m = ref.current.minute;
    addEvents(s.events.map((e) => mkEvent(e.type, e.side, m + e.offset, e.player)));
  };

  // ─── Pre-game screen ────────────────────────────────────────────────────────

  if (!started) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-6 px-6 text-center">
        <div className="text-5xl">⚽</div>
        <div>
          <h1 className="text-2xl font-black mb-1">Second Screen</h1>
          <p className="text-gray-500 text-sm">
            Predict what happens next. Read the game better than your friends.
          </p>
        </div>
        <div className="flex items-center gap-4 text-sm font-bold">
          <span className="bg-[#CC2A2A] text-white px-3 py-1.5 rounded-lg">
            ATL
          </span>
          <span className="text-gray-600">vs</span>
          <span className="bg-[#1C4B8C] text-white px-3 py-1.5 rounded-lg">
            BAR
          </span>
        </div>
        <div className="text-xs text-gray-600 space-y-1 max-w-xs">
          <p>Answer fast predictions as they come.</p>
          <p>Build a streak. Earn bonus points.</p>
        </div>
        <button
          onClick={() => setStarted(true)}
          className="mt-2 bg-white text-black font-black py-3.5 px-10 rounded-full text-base active:scale-95 transition-transform"
        >
          Kick Off
        </button>
        <p className="text-[10px] text-gray-700">
          Simulation only · Not betting · Not trivia
        </p>
      </div>
    );
  }

  const activePreds = predictions.filter(
    (p) => p.status === "active" || p.status === "locked"
  );
  const recentResolved = [...predictions]
    .filter((p) => p.status === "resolved" || p.status === "expired")
    .reverse()
    .slice(0, 3);
  const intensity = calcIntensity(events, minute);

  return (
    <div className="flex flex-col min-h-screen">
      {/* Score flash */}
      {flash && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-green-500 text-white text-lg font-black px-5 py-2 rounded-full shadow-xl pointer-events-none">
          {flash}
        </div>
      )}

      {/* Match header */}
      <div className="bg-[#0f0f0f] border-b border-white/8 px-4 pt-4 pb-3 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-3 text-[11px]">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            <span className="font-semibold text-red-400 tracking-widest uppercase">
              Live
            </span>
          </div>
          <span className="text-gray-500 tabular-nums">{minute}&apos;</span>
          <span
            className={
              intensity === "high"
                ? "text-orange-400 font-semibold"
                : intensity === "medium"
                ? "text-yellow-500"
                : "text-gray-600"
            }
          >
            {intensity === "high"
              ? "🔥 Intense"
              : intensity === "medium"
              ? "⚡ Active"
              : "💤 Quiet"}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex-1 text-right pr-3">
            <div className="text-sm font-black text-[#CC2A2A]">ATL</div>
            <div className="text-[10px] text-gray-600">Atletico</div>
          </div>
          <div className="flex items-center gap-2.5 bg-white/5 px-4 py-1.5 rounded-xl">
            <span className="text-2xl font-black tabular-nums">{goals.home}</span>
            <span className="text-gray-600 text-lg">–</span>
            <span className="text-2xl font-black tabular-nums">{goals.away}</span>
          </div>
          <div className="flex-1 text-left pl-3">
            <div className="text-sm font-black text-[#5B8FD4]">BAR</div>
            <div className="text-[10px] text-gray-600">Barcelona</div>
          </div>
        </div>
      </div>

      {/* Player score */}
      <div className="bg-[#0a0a0a] border-b border-white/5 px-4 py-2 flex items-center justify-between text-xs">
        <span className="text-gray-500">Your score</span>
        <div className="flex items-center gap-3">
          <span className="font-black text-sm text-white">
            {score.points}
            <span className="text-gray-600 font-normal text-xs"> pts</span>
          </span>
          {score.streak >= 2 && (
            <span className="text-orange-400 font-bold text-[11px]">
              🔥 ×{streakMult(score.streak).toFixed(score.streak >= 2 ? 1 : 0)}
            </span>
          )}
          <span className="text-green-500">✓{score.correct}</span>
          <span className="text-red-500">✗{score.incorrect}</span>
        </div>
      </div>

      <div className="flex flex-col gap-4 px-4 py-4">
        {/* Active predictions */}
        {activePreds.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="text-3xl mb-2">👀</div>
            <p className="text-gray-500 text-sm">Watching the game...</p>
            <p className="text-gray-700 text-xs mt-1">
              Next prediction coming soon
            </p>
          </div>
        )}

        {activePreds.map((pred) => (
          <PredCard
            key={pred.id}
            pred={pred}
            answer={answers[pred.id]}
            onAnswer={(opt) => submitAnswer(pred.id, opt)}
          />
        ))}

        {/* Resolved */}
        {recentResolved.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-[10px] text-gray-600 font-semibold uppercase tracking-widest">
              Recent
            </p>
            {recentResolved.map((pred) => (
              <ResolvedCard
                key={pred.id}
                pred={pred}
                answer={answers[pred.id]}
              />
            ))}
          </div>
        )}

        {/* Scenario buttons */}
        <div className="flex flex-col gap-2">
          <p className="text-[10px] text-gray-600 font-semibold uppercase tracking-widest">
            Simulate
          </p>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(SCENARIOS).map(([key, s]) => (
              <button
                key={key}
                onClick={() => runScenario(key)}
                className="bg-white/5 hover:bg-white/10 border border-white/8 rounded-xl px-3 py-3 text-left active:scale-95 transition-all"
              >
                <div className="text-xl mb-1">{s.emoji}</div>
                <div className="text-xs font-semibold text-white/90">
                  {s.label}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Event feed */}
        {events.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="text-[10px] text-gray-600 font-semibold uppercase tracking-widest">
              Match feed
            </p>
            {[...events]
              .reverse()
              .slice(0, 6)
              .map((e) => (
                <div
                  key={e.id}
                  className="flex items-center gap-2 text-xs text-gray-500"
                >
                  <span className="tabular-nums text-gray-700 w-5 shrink-0">
                    {e.minute}&apos;
                  </span>
                  <EventDot type={e.type} />
                  <span>{e.label}</span>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── PredCard ─────────────────────────────────────────────────────────────────

function PredCard({
  pred,
  answer,
  onAnswer,
}: {
  pred: Prediction;
  answer?: string;
  onAnswer: (opt: string) => void;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  const locked = pred.status === "locked" || answer !== undefined;
  const secsLeft = Math.max(0, Math.ceil((pred.lockTs - now) / 1000));
  const lockPct = Math.min(
    1,
    (now - pred.createdTs) / (pred.lockTs - pred.createdTs)
  );

  return (
    <div className="bg-[#111] border border-white/10 rounded-2xl overflow-hidden">
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start justify-between gap-2 mb-4">
          <p className="font-bold text-sm leading-snug">{pred.text}</p>
          <span className="text-[10px] text-gray-600 bg-white/5 px-1.5 py-0.5 rounded-md shrink-0 tabular-nums">
            {Math.round(pred.confidence * 100)}%
          </span>
        </div>
        <div className="flex gap-2">
          {pred.options.map((opt) => {
            const picked = answer === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => !locked && onAnswer(opt.id)}
                disabled={locked}
                className={`flex-1 py-3 px-2 rounded-xl text-sm font-bold transition-all active:scale-95 text-center
                  ${
                    picked
                      ? "bg-white text-black"
                      : locked
                      ? "bg-white/5 text-gray-700 cursor-default"
                      : "bg-white/10 text-white hover:bg-white/20"
                  }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="px-4 py-2.5 bg-white/[0.03] flex items-center justify-between gap-3">
        {!locked && secsLeft > 0 ? (
          <>
            <span className="text-[11px] text-gray-500">
              Closes in 0:{String(secsLeft).padStart(2, "0")}
            </span>
            <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-white/30 rounded-full transition-all"
                style={{ width: `${(1 - lockPct) * 100}%` }}
              />
            </div>
          </>
        ) : answer ? (
          <span className="text-[11px] text-gray-500">
            Your pick:{" "}
            <span className="text-white font-semibold">
              {pred.options.find((o) => o.id === answer)?.label}
            </span>
            <span className="text-gray-700"> · resolving…</span>
          </span>
        ) : (
          <span className="text-[11px] text-gray-700">Locked · resolving…</span>
        )}
      </div>
    </div>
  );
}

// ─── ResolvedCard ─────────────────────────────────────────────────────────────

function ResolvedCard({
  pred,
  answer,
}: {
  pred: Prediction;
  answer?: string;
}) {
  const correct = answer !== undefined && answer === pred.resultId;
  const wrong = answer !== undefined && answer !== pred.resultId;
  return (
    <div
      className={`rounded-xl px-3 py-2.5 border text-xs flex items-start gap-2.5
        ${
          correct
            ? "bg-green-950/50 border-green-800/30"
            : wrong
            ? "bg-red-950/40 border-red-900/30"
            : "bg-white/3 border-white/6"
        }`}
    >
      <span className="text-base mt-0.5 shrink-0">
        {correct ? "✅" : wrong ? "❌" : pred.status === "expired" ? "⏰" : "⭕"}
      </span>
      <div className="min-w-0">
        <p className="font-semibold text-gray-300 truncate">{pred.text}</p>
        <p className="text-gray-600 mt-0.5">
          {pred.resultReason ?? "Expired"}
          {wrong && (
            <span>
              {" "}
              · You:{" "}
              <span className="text-gray-500">
                {pred.options.find((o) => o.id === answer)?.label}
              </span>
            </span>
          )}
        </p>
      </div>
    </div>
  );
}

// ─── EventDot ─────────────────────────────────────────────────────────────────

function EventDot({ type }: { type: EventType }) {
  const color: Record<EventType, string> = {
    goal: "bg-green-400",
    shot_on_target: "bg-orange-400",
    shot: "bg-yellow-500",
    corner: "bg-blue-400",
    foul: "bg-red-400",
    yellow_card: "bg-yellow-300",
    red_card: "bg-red-600",
  };
  return (
    <span
      className={`w-1.5 h-1.5 rounded-full shrink-0 mt-0.5 ${color[type]}`}
    />
  );
}
