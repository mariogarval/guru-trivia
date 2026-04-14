"use client";

import { useState, useEffect, useRef } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

type Side = "home" | "away";
type EventType =
  | "shot" | "shot_on_target" | "corner"
  | "foul" | "yellow_card" | "red_card" | "goal";
type Template =
  | "shot_next_2m" | "next_corner_team"
  | "foul_next_60s" | "next_yellow_team";
type PredStatus = "active" | "locked" | "resolved" | "expired";
type Phase = "quiet" | "home_pressure" | "away_pressure" | "heated";

type GameEvent = {
  id: string; type: EventType; side: Side;
  minute: number; ts: number; label: string;
};

type Option = { id: string; label: string };
type Votes = Record<string, number>;

type Prediction = {
  id: string; template: Template; text: string; options: Option[];
  createdTs: number; lockTs: number; resolveTs: number;
  status: PredStatus; confidence: number;
  votes: Votes; // live-updating fake vote distribution
  resultId?: string; resultReason?: string;
};

type Score = { points: number; streak: number; correct: number; incorrect: number };

// ─── Config ───────────────────────────────────────────────────────────────────

const HOME = { name: "Atletico Madrid", short: "ATL" };
const AWAY = { name: "Barcelona", short: "BAR" };

const TICK_MS = 3_000;      // 3s real = 1 match minute
const LOCK_MS = 16_000;
const RESOLVE_MS: Record<Template, number> = {
  shot_next_2m: 38_000,
  next_corner_team: 58_000,
  foul_next_60s: 30_000,
  next_yellow_team: 85_000,
};
const CADENCE: Record<string, number> = { high: 12_000, medium: 18_000, low: 28_000 };
const MAX_ACTIVE = 3;
const STREAK_MULT = [1, 1, 1.5, 2, 2.5, 3];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2, 10);
const streakMult = (s: number) => STREAK_MULT[Math.min(s, STREAK_MULT.length - 1)] ?? 1;

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
  return s >= 8 ? "high" : s >= 3 ? "medium" : "low";
}

const EVT_LABELS: Record<EventType, string> = {
  shot: "Shot", shot_on_target: "Shot on target",
  corner: "Corner", foul: "Foul",
  yellow_card: "Yellow card 🟨", red_card: "Red card 🟥", goal: "⚽ GOAL",
};

function mkEvent(type: EventType, side: Side, minute: number, player?: string): GameEvent {
  const team = side === "home" ? HOME.short : AWAY.short;
  return {
    id: uid(), type, side, minute, ts: Date.now(),
    label: `${EVT_LABELS[type]} — ${team}${player ? ` (${player})` : ""}`,
  };
}

// ─── Vote simulation ──────────────────────────────────────────────────────────

function initVotes(options: Option[]): Votes {
  const total = Math.floor(Math.random() * 180) + 40;
  const votes: Votes = {};
  let rem = total;
  for (let i = 0; i < options.length - 1; i++) {
    const share = 0.2 + Math.random() * 0.5;
    const count = Math.min(Math.floor(total * share), rem);
    votes[options[i].id] = count;
    rem -= count;
  }
  votes[options[options.length - 1].id] = Math.max(0, rem);
  return votes;
}

function tickVotes(votes: Votes, options: Option[]): Votes {
  const updated = { ...votes };
  const n = Math.floor(Math.random() * 5); // 0–4 new votes per cycle
  for (let i = 0; i < n; i++) {
    const opt = options[Math.floor(Math.random() * options.length)];
    if (opt) updated[opt.id] = (updated[opt.id] ?? 0) + 1;
  }
  return updated;
}

// ─── Prediction generation ────────────────────────────────────────────────────

function tryGenerate(events: GameEvent[], minute: number, active: Prediction[]): Prediction | null {
  const now = Date.now();
  const used = new Set(active.map((p) => p.template));

  const recent = (types: EventType[], mins: number) =>
    events.filter((e) => types.includes(e.type) && e.minute >= minute - mins);

  const shots3    = recent(["shot", "shot_on_target"], 3);
  const corners5  = recent(["corner"], 5);
  const fouls5    = recent(["foul"], 5);
  const cards10   = recent(["yellow_card"], 10);
  const pressure3 = recent(["shot", "shot_on_target", "corner"], 3).length;
  const intensity = calcIntensity(events, minute);

  function make(template: Template, text: string, options: Option[], conf: number): Prediction {
    return {
      id: uid(), template, text, options,
      createdTs: now, lockTs: now + LOCK_MS,
      resolveTs: now + RESOLVE_MS[template],
      status: "active",
      confidence: Math.min(conf, 1),
      votes: initVotes(options),
    };
  }

  const candidates: Array<{ t: Template; w: number; build: () => Prediction | null }> = [
    {
      t: "shot_next_2m", w: shots3.length > 0 ? 3 : 1.2,
      build: () => {
        const c = 0.35 + shots3.length * 0.12 + (intensity === "high" ? 0.2 : 0);
        if (c < 0.38) return null;
        return make("shot_next_2m", "Will there be a shot in the next 2 minutes?",
          [{ id: "yes", label: "Yes" }, { id: "no", label: "No" }], c);
      },
    },
    {
      t: "next_corner_team", w: corners5.length > 0 ? 3 : 1.2,
      build: () => {
        const c = 0.3 + corners5.length * 0.1 + pressure3 * 0.07;
        if (c < 0.32) return null;
        return make("next_corner_team", "Which team will take the next corner?", [
          { id: "home", label: HOME.short },
          { id: "away", label: AWAY.short },
          { id: "no_corner", label: "No corner" },
        ], c);
      },
    },
    {
      t: "foul_next_60s", w: fouls5.length > 0 ? 2.5 : 1.2,
      build: () => {
        const c = 0.28 + fouls5.length * 0.1 + (intensity !== "low" ? 0.12 : 0);
        if (c < 0.32) return null;
        return make("foul_next_60s", "Will there be a foul in the next 60 seconds?",
          [{ id: "yes", label: "Yes" }, { id: "no", label: "No" }], c);
      },
    },
    {
      t: "next_yellow_team", w: cards10.length > 0 || fouls5.length > 1 ? 2.5 : 0.8,
      build: () => {
        const c = 0.25 + fouls5.length * 0.08 + cards10.length * 0.12;
        if (c < 0.28) return null;
        return make("next_yellow_team", "Which team gets the next yellow card?", [
          { id: "home", label: HOME.short },
          { id: "away", label: AWAY.short },
          { id: "no_card", label: "No card" },
        ], c);
      },
    },
  ];

  const available = candidates.filter((c) => !used.has(c.t)).sort((a, b) => b.w - a.w);
  for (const c of available) {
    const p = c.build();
    if (p) return p;
  }
  return null;
}

// ─── Resolution ───────────────────────────────────────────────────────────────

function resolveAll(predictions: Prediction[], events: GameEvent[]): Prediction[] {
  const now = Date.now();
  return predictions.map((p) => {
    if (p.status !== "active" && p.status !== "locked") return p;
    if (p.status === "active" && now > p.lockTs) p = { ...p, status: "locked" };

    const post = events.filter((e) => e.ts > p.createdTs);
    const past = now > p.resolveTs;

    switch (p.template) {
      case "shot_next_2m": {
        const h = post.find((e) => e.type === "shot" || e.type === "shot_on_target");
        if (h) return { ...p, status: "resolved", resultId: "yes", resultReason: `Shot at ${h.minute}'` };
        if (past) return { ...p, status: "resolved", resultId: "no", resultReason: "No shot in window" };
        break;
      }
      case "next_corner_team": {
        const h = post.find((e) => e.type === "corner");
        if (h) return { ...p, status: "resolved", resultId: h.side === "home" ? "home" : "away", resultReason: `${h.side === "home" ? HOME.short : AWAY.short} corner at ${h.minute}'` };
        if (past) return { ...p, status: "resolved", resultId: "no_corner", resultReason: "No corner in window" };
        break;
      }
      case "foul_next_60s": {
        const h = post.find((e) => e.type === "foul");
        if (h) return { ...p, status: "resolved", resultId: "yes", resultReason: `Foul at ${h.minute}'` };
        if (past) return { ...p, status: "resolved", resultId: "no", resultReason: "No foul in window" };
        break;
      }
      case "next_yellow_team": {
        const h = post.find((e) => e.type === "yellow_card");
        if (h) return { ...p, status: "resolved", resultId: h.side === "home" ? "home" : "away", resultReason: `Yellow card to ${h.side === "home" ? HOME.short : AWAY.short} at ${h.minute}'` };
        if (past) return { ...p, status: "resolved", resultId: "no_card", resultReason: "No yellow card in window" };
        break;
      }
    }
    if (now > p.resolveTs + 15_000) return { ...p, status: "expired" };
    return p;
  });
}

// ─── Phase-based auto-simulation ─────────────────────────────────────────────
// Each phase has weighted event probabilities. The game cycles through phases
// automatically so all 4 prediction types appear organically.

type PhaseConfig = Array<{ type: EventType; side: Side | "random"; w: number }>;

const PHASE_CONFIGS: Record<Phase, { threshold: number; events: PhaseConfig }> = {
  quiet: {
    threshold: 0.18,
    events: [
      { type: "foul", side: "random", w: 4 },
      { type: "shot", side: "random", w: 3 },
      { type: "corner", side: "random", w: 2 },
    ],
  },
  home_pressure: {
    threshold: 0.55,
    events: [
      { type: "shot", side: "home", w: 5 },
      { type: "corner", side: "home", w: 4 },
      { type: "shot_on_target", side: "home", w: 3 },
      { type: "foul", side: "away", w: 2 },
    ],
  },
  away_pressure: {
    threshold: 0.55,
    events: [
      { type: "shot", side: "away", w: 5 },
      { type: "corner", side: "away", w: 4 },
      { type: "shot_on_target", side: "away", w: 3 },
      { type: "foul", side: "home", w: 2 },
    ],
  },
  heated: {
    threshold: 0.5,
    events: [
      { type: "foul", side: "random", w: 6 },
      { type: "foul", side: "random", w: 4 },
      { type: "yellow_card", side: "random", w: 3 },
      { type: "shot", side: "random", w: 2 },
    ],
  },
};

const PHASE_SEQUENCE: Phase[] = [
  "quiet", "away_pressure", "quiet", "home_pressure",
  "heated", "away_pressure", "quiet", "home_pressure",
  "heated", "away_pressure",
];

function pickFromPool(pool: PhaseConfig, minute: number): GameEvent {
  const total = pool.reduce((s, e) => s + e.w, 0);
  let r = Math.random() * total;
  for (const entry of pool) {
    r -= entry.w;
    if (r <= 0) {
      const side: Side = entry.side === "random" ? (Math.random() < 0.5 ? "home" : "away") : entry.side;
      return mkEvent(entry.type, side, minute);
    }
  }
  const e = pool[0]!;
  const side: Side = e.side === "random" ? "home" : e.side;
  return mkEvent(e.type, side, minute);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function LivePage() {
  const [started, setStarted] = useState(false);
  const [minute, setMinute] = useState(1);
  const [goals, setGoals] = useState({ home: 0, away: 0 });
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [score, setScore] = useState<Score>({ points: 0, streak: 0, correct: 0, incorrect: 0 });
  const [scoredIds, setScoredIds] = useState<Set<string>>(new Set());
  const [lastGenTs, setLastGenTs] = useState<number | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [phaseTicks, setPhaseTicks] = useState(0);

  const ref = useRef({ minute, events, predictions, answers, score, scoredIds, lastGenTs, phaseIdx, phaseTicks });
  ref.current = { minute, events, predictions, answers, score, scoredIds, lastGenTs, phaseIdx, phaseTicks };

  const addEvents = (newEvts: GameEvent[]) => {
    setEvents((prev) => [...prev, ...newEvts].slice(-50));
    for (const e of newEvts) {
      if (e.type === "goal") {
        setGoals((g) => ({
          home: e.side === "home" ? g.home + 1 : g.home,
          away: e.side === "away" ? g.away + 1 : g.away,
        }));
      }
    }
  };

  // Seed initial diverse events when game starts
  useEffect(() => {
    if (!started) return;
    addEvents([
      mkEvent("foul", "home", 2),
      mkEvent("shot", "away", 3),
      mkEvent("corner", "away", 4),
      mkEvent("foul", "home", 5),
      mkEvent("shot_on_target", "away", 5),
    ]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started]);

  // Match clock + phase-driven auto-simulation
  useEffect(() => {
    if (!started) return;
    const t = setInterval(() => {
      const { minute: m, phaseIdx: pi, phaseTicks: pt } = ref.current;
      const newMinute = m + 1;
      setMinute(newMinute);

      // Advance phase
      const phaseDuration = 8 + Math.floor(Math.random() * 6); // 8–13 ticks per phase
      let newPi = pi;
      let newPt = pt + 1;
      if (newPt >= phaseDuration) {
        newPi = (pi + 1) % PHASE_SEQUENCE.length;
        newPt = 0;
      }
      setPhaseIdx(newPi);
      setPhaseTicks(newPt);

      const phase = PHASE_SEQUENCE[newPi]!;
      const { threshold, events: pool } = PHASE_CONFIGS[phase];

      if (Math.random() < threshold) {
        addEvents([pickFromPool(pool, newMinute)]);
      }
      // Occasional goal based on pressure phase
      if ((phase === "home_pressure" || phase === "away_pressure") && Math.random() < 0.04) {
        const side: Side = phase === "home_pressure" ? "home" : "away";
        addEvents([mkEvent("goal", side, newMinute, side === "home" ? "Griezmann" : "Lewandowski")]);
      }
    }, TICK_MS);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started]);

  // Engine: resolve → score → generate + tick votes every second
  useEffect(() => {
    if (!started) return;
    const t = setInterval(() => {
      const { minute: m, events: evts, predictions: preds, answers: ans, score: sc, scoredIds: sid, lastGenTs: lgt } = ref.current;

      // Resolve
      const resolved = resolveAll(preds, evts);

      // Score newly resolved
      let newScore = { ...sc };
      let gain = 0;
      const newSids = new Set(sid);

      for (const p of resolved) {
        if (p.status === "resolved" && p.resultId && !sid.has(p.id)) {
          newSids.add(p.id);
          const answer = ans[p.id];
          if (answer !== undefined) {
            if (answer === p.resultId) {
              const pts = Math.round(10 * streakMult(newScore.streak));
              gain += pts;
              newScore = { ...newScore, points: newScore.points + pts, streak: newScore.streak + 1, correct: newScore.correct + 1 };
            } else {
              newScore = { ...newScore, streak: 0, incorrect: newScore.incorrect + 1 };
            }
          }
        }
      }

      if (gain > 0) {
        setFlash(`+${gain} pts`);
        setTimeout(() => setFlash(null), 2000);
      }

      // Tick votes on active/locked predictions
      const withUpdatedVotes = resolved.map((p) =>
        p.status === "active" || p.status === "locked"
          ? { ...p, votes: tickVotes(p.votes, p.options) }
          : p
      );

      setPredictions(withUpdatedVotes);
      setScore(newScore);
      setScoredIds(newSids);

      // Generate
      const active = withUpdatedVotes.filter((p) => p.status === "active" || p.status === "locked");
      if (active.length < MAX_ACTIVE) {
        const intensity = calcIntensity(evts, m);
        const cadence = CADENCE[intensity] ?? 18_000;
        const now = Date.now();
        if (!lgt || now - lgt > cadence) {
          const next = tryGenerate(evts, m, active);
          if (next) {
            setPredictions((prev) => [...withUpdatedVotes.filter(p => prev.some(pp => pp.id === p.id)), next]);
            setLastGenTs(now);
          }
        }
      }
    }, 1_000);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started]);

  const submitAnswer = (predId: string, optId: string) => {
    const pred = ref.current.predictions.find((p) => p.id === predId);
    if (!pred || pred.status !== "active" || ref.current.answers[predId]) return;
    setAnswers((prev) => ({ ...prev, [predId]: optId }));
  };

  const currentPhase = PHASE_SEQUENCE[phaseIdx] ?? "quiet";
  const intensity = calcIntensity(events, minute);

  const activePreds = predictions.filter((p) => p.status === "active" || p.status === "locked");
  const recentResolved = [...predictions]
    .filter((p) => p.status === "resolved" || p.status === "expired")
    .reverse()
    .slice(0, 4);

  // ─── Pre-game ──────────────────────────────────────────────────────────────

  if (!started) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-6 px-6 text-center">
        <div className="text-5xl">⚽</div>
        <div>
          <h1 className="text-2xl font-black mb-1">Second Screen</h1>
          <p className="text-gray-500 text-sm max-w-xs">
            Predict what happens next. Read the game better than your friends.
          </p>
        </div>
        <div className="flex items-center gap-4 text-sm font-bold">
          <span className="bg-[#CC2A2A] text-white px-3 py-1.5 rounded-lg">{HOME.short}</span>
          <span className="text-gray-600">vs</span>
          <span className="bg-[#1C4B8C] text-white px-3 py-1.5 rounded-lg">{AWAY.short}</span>
        </div>
        <ul className="text-xs text-gray-500 space-y-1 text-left">
          <li>• Answer predictions as they appear live</li>
          <li>• See how other fans are voting in real time</li>
          <li>• Build streaks for bonus points</li>
        </ul>
        <button
          onClick={() => setStarted(true)}
          className="mt-2 bg-white text-black font-black py-3.5 px-10 rounded-full text-base active:scale-95 transition-transform"
        >
          Kick Off
        </button>
        <p className="text-[10px] text-gray-700">Simulation only · Not betting</p>
      </div>
    );
  }

  // ─── Live game ─────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col min-h-screen">
      {/* Score flash */}
      {flash && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-green-500 text-white text-lg font-black px-5 py-2 rounded-full shadow-xl pointer-events-none animate-bounce">
          {flash}
        </div>
      )}

      {/* Match header */}
      <div className="bg-[#0f0f0f] border-b border-white/8 px-4 pt-4 pb-3 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-3 text-[11px]">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            <span className="font-semibold text-red-400 tracking-widest uppercase">Live</span>
          </div>
          <span className="text-gray-500 tabular-nums">{minute}&apos;</span>
          <PhaseLabel phase={currentPhase} intensity={intensity} />
        </div>
        <div className="flex items-center justify-between">
          <div className="flex-1 text-right pr-3">
            <div className="text-sm font-black text-[#CC2A2A]">{HOME.short}</div>
            <div className="text-[10px] text-gray-600">{HOME.name}</div>
          </div>
          <div className="flex items-center gap-2.5 bg-white/5 px-4 py-1.5 rounded-xl">
            <span className="text-2xl font-black tabular-nums">{goals.home}</span>
            <span className="text-gray-600 text-lg">–</span>
            <span className="text-2xl font-black tabular-nums">{goals.away}</span>
          </div>
          <div className="flex-1 text-left pl-3">
            <div className="text-sm font-black text-[#5B8FD4]">{AWAY.short}</div>
            <div className="text-[10px] text-gray-600">{AWAY.name}</div>
          </div>
        </div>
      </div>

      {/* Score bar */}
      <div className="bg-[#0a0a0a] border-b border-white/5 px-4 py-2 flex items-center justify-between text-xs">
        <span className="text-gray-500">Your score</span>
        <div className="flex items-center gap-3">
          <span className="font-black text-sm text-white">
            {score.points}<span className="text-gray-600 font-normal text-xs"> pts</span>
          </span>
          {score.streak >= 2 && (
            <span className="text-orange-400 font-bold text-[11px]">
              🔥 ×{streakMult(score.streak).toFixed(1)}
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
            <p className="text-gray-500 text-sm">Watching the game…</p>
            <p className="text-gray-700 text-xs mt-1">Next prediction coming soon</p>
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
            <p className="text-[10px] text-gray-600 font-semibold uppercase tracking-widest">Settled</p>
            {recentResolved.map((pred) => (
              <ResolvedCard key={pred.id} pred={pred} answer={answers[pred.id]} />
            ))}
          </div>
        )}

        {/* Event feed */}
        {events.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="text-[10px] text-gray-600 font-semibold uppercase tracking-widest">Match feed</p>
            {[...events].reverse().slice(0, 7).map((e) => (
              <div key={e.id} className="flex items-center gap-2 text-xs text-gray-500">
                <span className="tabular-nums text-gray-700 w-5 shrink-0">{e.minute}&apos;</span>
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

function PredCard({ pred, answer, onAnswer }: {
  pred: Prediction; answer?: string; onAnswer: (opt: string) => void;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  const locked = pred.status === "locked" || answer !== undefined;
  const secsLeft = Math.max(0, Math.ceil((pred.lockTs - now) / 1000));
  const lockPct = Math.min(1, (now - pred.createdTs) / (pred.lockTs - pred.createdTs));
  const totalVotes = Object.values(pred.votes).reduce((s, v) => s + v, 0);

  return (
    <div className="bg-[#111] border border-white/10 rounded-2xl overflow-hidden">
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start justify-between gap-2 mb-4">
          <p className="font-bold text-sm leading-snug">{pred.text}</p>
          <span className="text-[10px] text-gray-600 bg-white/5 px-1.5 py-0.5 rounded-md shrink-0">
            {Math.round(pred.confidence * 100)}%
          </span>
        </div>

        {/* Option buttons */}
        <div className="flex gap-2">
          {pred.options.map((opt) => {
            const picked = answer === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => !locked && onAnswer(opt.id)}
                disabled={locked}
                className={`flex-1 py-3 px-2 rounded-xl text-sm font-bold transition-all active:scale-95 text-center
                  ${picked ? "bg-white text-black"
                    : locked ? "bg-white/5 text-gray-700 cursor-default"
                    : "bg-white/10 text-white hover:bg-white/20"}`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Vote bars — shown after answering */}
        {answer && totalVotes > 0 && (
          <div className="mt-4 flex flex-col gap-2">
            {pred.options.map((opt) => {
              const count = pred.votes[opt.id] ?? 0;
              const pct = Math.round((count / totalVotes) * 100);
              const isPicked = answer === opt.id;
              return (
                <div key={opt.id} className="flex items-center gap-2">
                  <span className={`text-[11px] w-14 shrink-0 font-semibold ${isPicked ? "text-white" : "text-gray-500"}`}>
                    {opt.label}
                  </span>
                  <div className="flex-1 h-1.5 bg-white/8 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${isPicked ? "bg-white" : "bg-white/25"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className={`text-[11px] w-8 text-right tabular-nums font-semibold ${isPicked ? "text-white" : "text-gray-600"}`}>
                    {pct}%
                  </span>
                </div>
              );
            })}
            <p className="text-[10px] text-gray-700 mt-0.5">{(totalVotes + 1).toLocaleString()} votes</p>
          </div>
        )}
      </div>

      {/* Footer */}
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

function ResolvedCard({ pred, answer }: { pred: Prediction; answer?: string }) {
  const correct = answer !== undefined && answer === pred.resultId;
  const wrong   = answer !== undefined && answer !== pred.resultId;
  const totalVotes = Object.values(pred.votes).reduce((s, v) => s + v, 0);

  return (
    <div className={`rounded-xl border overflow-hidden text-xs
      ${correct ? "bg-green-950/50 border-green-800/30"
        : wrong  ? "bg-red-950/40 border-red-900/30"
        : "bg-white/3 border-white/6"}`}
    >
      <div className="px-3 pt-2.5 pb-2">
        <div className="flex items-start gap-2 mb-2">
          <span className="text-base shrink-0">
            {correct ? "✅" : wrong ? "❌" : pred.status === "expired" ? "⏰" : "⭕"}
          </span>
          <div>
            <p className="font-semibold text-gray-300">{pred.text}</p>
            <p className="text-gray-600 mt-0.5">{pred.resultReason ?? "Expired"}</p>
          </div>
        </div>

        {/* Final vote distribution */}
        {totalVotes > 0 && (
          <div className="flex flex-col gap-1.5 mt-2">
            {pred.options.map((opt) => {
              const count = pred.votes[opt.id] ?? 0;
              const pct = Math.round((count / totalVotes) * 100);
              const isResult = opt.id === pred.resultId;
              const isPicked = opt.id === answer;
              return (
                <div key={opt.id} className="flex items-center gap-2">
                  <span className={`text-[10px] w-14 shrink-0 font-semibold
                    ${isResult ? "text-green-400" : isPicked ? "text-white" : "text-gray-600"}`}>
                    {opt.label}{isResult ? " ✓" : ""}
                  </span>
                  <div className="flex-1 h-1 bg-white/8 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${isResult ? "bg-green-400" : "bg-white/20"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className={`text-[10px] w-7 text-right tabular-nums ${isResult ? "text-green-400" : "text-gray-600"}`}>
                    {pct}%
                  </span>
                </div>
              );
            })}
            <p className="text-[10px] text-gray-700">{totalVotes.toLocaleString()} votes</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── PhaseLabel ───────────────────────────────────────────────────────────────

function PhaseLabel({ phase, intensity }: { phase: Phase; intensity: string }) {
  const labels: Record<Phase, string> = {
    quiet: "💤 Quiet",
    home_pressure: "🔴 ATL Pressure",
    away_pressure: "🔵 BAR Pressure",
    heated: "🔥 Heated",
  };
  const colors: Record<string, string> = {
    high: "text-orange-400",
    medium: "text-yellow-500",
    low: "text-gray-600",
  };
  return (
    <span className={`text-[11px] font-semibold ${colors[intensity] ?? "text-gray-600"}`}>
      {labels[phase]}
    </span>
  );
}

// ─── EventDot ─────────────────────────────────────────────────────────────────

function EventDot({ type }: { type: EventType }) {
  const color: Record<EventType, string> = {
    goal: "bg-green-400", shot_on_target: "bg-orange-400",
    shot: "bg-yellow-500", corner: "bg-blue-400",
    foul: "bg-red-400", yellow_card: "bg-yellow-300", red_card: "bg-red-600",
  };
  return <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${color[type]}`} />;
}
