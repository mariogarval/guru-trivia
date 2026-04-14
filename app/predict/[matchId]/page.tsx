"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { ArrowLeft, ChevronRight, Trophy, Clock, Zap, Users, Lock } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import type {
  MatchPrediction,
  PredictionPhase,
  PredictionSession,
  LiveScoreData,
  SimulatedRanker,
} from "@/types/predictions";

// ── Constants ──────────────────────────────────────────────────────────────────

const POINTS_BASE = 100;
const POINTS_CONTRARIAN_BONUS = 50;
const POLL_INTERVAL_MS = 30_000;
const VOTE_JITTER_MS = 8_000;

// ── Helpers ────────────────────────────────────────────────────────────────────

function derivePhase(data: LiveScoreData | null): PredictionPhase {
  if (!data) return "pregame";
  if (data.status === "finished") return "fulltime";
  const detail = data.statusDetail?.toLowerCase() ?? "";
  if (detail.includes("half time") || detail.includes("halftime")) return "halftime";
  if (data.status === "live" && data.period === 2) return "live_second_half";
  if (data.status === "live") return "live_first_half";
  return "pregame";
}

function storageKey(matchId: string) {
  return `guru_pred_${matchId}`;
}

function loadSession(matchId: string): PredictionSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey(matchId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveSession(session: PredictionSession) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey(session.matchId), JSON.stringify(session));
  } catch {}
}

function totalVotes(pred: MatchPrediction): number {
  return pred.options.reduce((s, o) => s + o.votes, 0);
}

function pct(votes: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((votes / total) * 100);
}

function buildSimulatedLeaderboard(myPoints: number, myCorrect: number): SimulatedRanker[] {
  const names = [
    ["FutebolGuru", "🇧🇷"], ["LaLigaKing", "🇪🇸"], ["PremierFan", "🏴󠁧󠁢󠁥󠁮󠁧󠁿"],
    ["GolazoPedro", "🇲🇽"], ["TifoseriaMax", "🇮🇹"], ["ScoutingEye", "🇩🇪"],
    ["Mbappe_Fan99", "🇫🇷"], ["TacticsTalk", "🇵🇹"],
  ];
  const rows: SimulatedRanker[] = names.map(([username, avatar], i) => ({
    rank: 0,
    username: username as string,
    avatar: avatar as string,
    points: myPoints + Math.round((Math.random() - 0.3) * 120) + (8 - i) * 15,
    correct: Math.min(6, Math.max(0, myCorrect + Math.round((Math.random() - 0.4) * 3))),
  }));
  rows.push({ rank: 0, username: "You", avatar: "⚽", points: myPoints, correct: myCorrect, isYou: true });
  rows.sort((a, b) => b.points - a.points);
  rows.forEach((r, i) => (r.rank = i + 1));
  return rows;
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PredictPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const matchId = Array.isArray(params.matchId) ? params.matchId[0] : params.matchId ?? "";

  // From URL search params (passed by MatchCard)
  const homeTeamParam = searchParams.get("home") ?? "Home Team";
  const awayTeamParam = searchParams.get("away") ?? "Away Team";
  const leagueParam = searchParams.get("league") ?? "";

  const { isLoggedIn, loading: authLoading } = useAuth();

  const [phase, setPhase] = useState<PredictionPhase>("pregame");
  const [liveData, setLiveData] = useState<LiveScoreData | null>(null);
  const [session, setSession] = useState<PredictionSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [showVotes, setShowVotes] = useState<Set<string>>(new Set());
  const [leaderboard, setLeaderboard] = useState<SimulatedRanker[]>([]);
  const [secondHalfLoaded, setSecondHalfLoaded] = useState(false);
  // Auth gate: shown when a guest tries to answer
  const [showAuthGate, setShowAuthGate] = useState(false);
  const [pendingAnswer, setPendingAnswer] = useState<{ predId: string; optionId: string } | null>(null);

  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  // ── Fetch live score & derive phase ────────────────────────────────────────
  const fetchLiveScore = useCallback(async () => {
    if (!matchId) return;
    try {
      const res = await fetch(`/api/matches/live-score?id=${matchId}`, { cache: "no-store" });
      if (!res.ok) return;
      const data: LiveScoreData = await res.json();
      setLiveData(data);
      const newPhase = derivePhase(data);
      if (newPhase !== phaseRef.current) {
        setPhase(newPhase);
      }
    } catch {}
  }, [matchId]);

  // ── Generate predictions ────────────────────────────────────────────────────
  const generatePredictions = useCallback(
    async (half: "first_half" | "second_half") => {
      setGenerating(true);
      try {
        const res = await fetch("/api/predictions/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            matchId,
            homeTeam: homeTeamParam,
            awayTeam: awayTeamParam,
            league: leagueParam,
            half,
          }),
        });
        if (!res.ok) throw new Error("API error");
        const data = await res.json();
        return (data.predictions ?? []) as MatchPrediction[];
      } catch (err) {
        console.error("Failed to generate predictions", err);
        return [] as MatchPrediction[];
      } finally {
        setGenerating(false);
      }
    },
    [matchId, homeTeamParam, awayTeamParam, leagueParam]
  );

  // ── Init ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      setLoading(true);

      // Load or create session
      let sess = loadSession(matchId);

      if (!sess) {
        const firstHalfPreds = await generatePredictions("first_half");
        sess = {
          matchId,
          homeTeam: homeTeamParam,
          awayTeam: awayTeamParam,
          league: leagueParam,
          predictions: firstHalfPreds,
          totalPoints: 0,
          correctCount: 0,
          createdAt: Date.now(),
        };
        saveSession(sess);
      }

      setSession(sess);
      await fetchLiveScore();
      setLoading(false);
    };

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  // ── Poll live score ─────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(fetchLiveScore, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [fetchLiveScore]);

  // ── Load second-half predictions at halftime ────────────────────────────────
  useEffect(() => {
    if (phase !== "halftime" || secondHalfLoaded || !session) return;
    const hasSecondHalf = session.predictions.some((p) => p.half === "second_half");
    if (hasSecondHalf) { setSecondHalfLoaded(true); return; }

    generatePredictions("second_half").then((preds) => {
      if (preds.length === 0) return;
      const updated: PredictionSession = {
        ...session,
        halftimeScore: liveData
          ? { home: parseInt(liveData.home_score), away: parseInt(liveData.away_score) }
          : undefined,
        predictions: [...session.predictions, ...preds],
      };
      setSession(updated);
      saveSession(updated);
      setSecondHalfLoaded(true);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, secondHalfLoaded]);

  // ── Build leaderboard at halftime / fulltime ────────────────────────────────
  useEffect(() => {
    if (phase === "halftime" || phase === "fulltime") {
      setLeaderboard(buildSimulatedLeaderboard(session?.totalPoints ?? 0, session?.correctCount ?? 0));
    }
  }, [phase, session?.totalPoints, session?.correctCount]);

  // ── Jitter votes to feel live ───────────────────────────────────────────────
  useEffect(() => {
    if (!session) return;
    const t = setInterval(() => {
      setSession((prev) => {
        if (!prev) return prev;
        const updated: PredictionSession = {
          ...prev,
          predictions: prev.predictions.map((p) => ({
            ...p,
            options: p.options.map((o) => ({
              ...o,
              votes: o.votes + Math.floor(Math.random() * 4),
            })),
          })),
        };
        return updated;
      });
    }, VOTE_JITTER_MS);
    return () => clearInterval(t);
  }, [session?.matchId]);

  // ── Answer handler ─────────────────────────────────────────────────────────
  const commitAnswer = useCallback(
    (predId: string, optionId: string) => {
      if (!session) return;
      const pred = session.predictions.find((p) => p.id === predId);
      if (!pred || pred.userAnswer) return;

      setShowVotes((prev) => new Set(Array.from(prev).concat(predId)));

      const updated: PredictionSession = {
        ...session,
        predictions: session.predictions.map((p) =>
          p.id === predId ? { ...p, userAnswer: optionId } : p
        ),
      };
      setSession(updated);
      saveSession(updated);
    },
    [session]
  );

  const handleAnswer = useCallback(
    (predId: string, optionId: string) => {
      if (!session) return;
      const pred = session.predictions.find((p) => p.id === predId);
      if (!pred || pred.userAnswer) return;

      // Gate: require login to save predictions
      if (!isLoggedIn && !authLoading) {
        setPendingAnswer({ predId, optionId });
        setShowAuthGate(true);
        return;
      }

      commitAnswer(predId, optionId);
    },
    [session, isLoggedIn, authLoading, commitAnswer]
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) return <LoadingScreen />;

  const firstHalfPreds = session?.predictions.filter((p) => p.half === "first_half") ?? [];
  const secondHalfPreds = session?.predictions.filter((p) => p.half === "second_half") ?? [];
  const answeredCount = (session?.predictions.filter((p) => p.userAnswer).length ?? 0);
  const firstHalfAnswered = firstHalfPreds.filter((p) => p.userAnswer).length;

  return (
    <div className="min-h-screen bg-black text-[#f0f0f0] flex flex-col">
      {/* Auth gate modal */}
      <AnimatePresence>
        {showAuthGate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm px-4 pb-8"
            onClick={() => setShowAuthGate(false)}
          >
            <motion.div
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm bg-[#0d0d0d] border border-[rgba(214,235,253,0.19)] rounded-2xl p-6"
            >
              <div className="flex items-center justify-center w-12 h-12 bg-[rgba(17,255,153,0.08)] border border-[rgba(17,255,153,0.2)] rounded-full mx-auto mb-4">
                <Lock size={20} className="text-[#11ff99]" />
              </div>
              <h2 className="text-lg font-black text-center mb-1">Save your predictions</h2>
              <p className="text-[#a1a4a5] text-sm text-center mb-5 leading-relaxed">
                Create a free account to save your picks, track your score, and see how you compare to other fans.
              </p>
              <Link
                href={`/auth/login?next=${encodeURIComponent(`/predict/${matchId}?home=${encodeURIComponent(homeTeamParam)}&away=${encodeURIComponent(awayTeamParam)}&league=${encodeURIComponent(leagueParam)}`)}`}
                className="block w-full text-center bg-[#11ff99] text-black font-black py-3.5 rounded-full text-sm hover:bg-[#11ff99]/90 transition-colors"
              >
                Create free account
              </Link>
              <button
                onClick={() => {
                  setShowAuthGate(false);
                  // Let them answer without saving (guest preview)
                  if (pendingAnswer) {
                    commitAnswer(pendingAnswer.predId, pendingAnswer.optionId);
                    setPendingAnswer(null);
                  }
                }}
                className="block w-full text-center text-[#464a4d] text-sm py-3 mt-1 hover:text-[#a1a4a5] transition-colors"
              >
                Continue without saving
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Header */}
      <header className="sticky top-0 z-30 bg-black/90 backdrop-blur-md border-b border-[rgba(214,235,253,0.19)] px-4 py-3 flex items-center gap-3">
        <Link href="/" className="p-1.5 -ml-1.5 text-[#a1a4a5] hover:text-[#f0f0f0] transition-colors">
          <ArrowLeft size={20} strokeWidth={2} />
        </Link>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-[#464a4d] uppercase tracking-wider font-medium truncate">
            {leagueParam || "Match Predictions"}
          </p>
          <p className="text-sm font-bold leading-tight truncate">
            {homeTeamParam} <span className="text-[#464a4d]">vs</span> {awayTeamParam}
          </p>
        </div>
        {/* Live score pill */}
        {liveData && liveData.status !== "scheduled" && (
          <div className="flex items-center gap-2 bg-white/[0.04] border border-[rgba(214,235,253,0.12)] rounded-full px-3 py-1">
            {liveData.status === "live" && (
              <span className="w-1.5 h-1.5 rounded-full bg-[#ff2047] live-pulse flex-shrink-0" />
            )}
            <span className="font-mono text-sm font-bold tabular-nums">
              {liveData.home_score} – {liveData.away_score}
            </span>
            {liveData.clock && (
              <span className="text-[#464a4d] text-xs">{liveData.clock}&prime;</span>
            )}
          </div>
        )}
      </header>

      <AnimatePresence mode="wait">
        {phase === "pregame" && (
          <PregameScreen
            key="pregame"
            homeTeam={homeTeamParam}
            awayTeam={awayTeamParam}
            predictions={firstHalfPreds}
            showVotes={showVotes}
            answeredCount={firstHalfAnswered}
            onAnswer={handleAnswer}
            generating={generating}
          />
        )}
        {phase === "live_first_half" && (
          <LiveWatchScreen
            key="live_first"
            half="first"
            liveData={liveData}
            homeTeam={homeTeamParam}
            awayTeam={awayTeamParam}
            answeredCount={firstHalfAnswered}
            totalCount={firstHalfPreds.length}
          />
        )}
        {phase === "halftime" && (
          <HalftimeScreen
            key="halftime"
            homeTeam={homeTeamParam}
            awayTeam={awayTeamParam}
            liveData={liveData}
            firstHalfPreds={firstHalfPreds}
            secondHalfPreds={secondHalfPreds}
            session={session}
            leaderboard={leaderboard}
            showVotes={showVotes}
            generating={generating}
            onAnswer={handleAnswer}
          />
        )}
        {phase === "live_second_half" && (
          <LiveWatchScreen
            key="live_second"
            half="second"
            liveData={liveData}
            homeTeam={homeTeamParam}
            awayTeam={awayTeamParam}
            answeredCount={secondHalfPreds.filter((p) => p.userAnswer).length}
            totalCount={secondHalfPreds.length}
          />
        )}
        {phase === "fulltime" && (
          <FulltimeScreen
            key="fulltime"
            homeTeam={homeTeamParam}
            awayTeam={awayTeamParam}
            liveData={liveData}
            session={session}
            leaderboard={leaderboard}
            answeredCount={answeredCount}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Loading ────────────────────────────────────────────────────────────────────

function LoadingScreen() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-5 px-6 py-20">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
        className="w-8 h-8 rounded-full border-2 border-[rgba(214,235,253,0.19)] border-t-[#11ff99]"
      />
      <p className="text-[#464a4d] text-sm">Loading predictions…</p>
    </div>
  );
}

// ── Pre-game Screen ───────────────────────────────────────────────────────────

function PregameScreen({
  homeTeam, awayTeam, predictions, showVotes, answeredCount, onAnswer, generating,
}: {
  homeTeam: string; awayTeam: string;
  predictions: MatchPrediction[];
  showVotes: Set<string>;
  answeredCount: number;
  onAnswer: (predId: string, optId: string) => void;
  generating: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="flex-1 pb-8"
    >
      {/* Section header */}
      <div className="px-4 pt-5 pb-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-bold uppercase tracking-[2px] text-[#11ff99]">First Half</span>
          <span className="text-[#464a4d] text-xs">·</span>
          <span className="text-[#464a4d] text-xs">Pre-match predictions</span>
        </div>
        <h1 className="text-2xl font-black tracking-tight">
          {homeTeam} <span className="text-[#464a4d]">vs</span> {awayTeam}
        </h1>
        <p className="text-[#464a4d] text-sm mt-1">
          Answer before kick-off. See how the community thinks.
        </p>
      </div>

      {/* Progress bar */}
      {predictions.length > 0 && (
        <div className="px-4 mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-[#464a4d]">{answeredCount} / {predictions.length} answered</span>
            {answeredCount === predictions.length && (
              <span className="text-xs font-bold text-[#11ff99]">All locked in ✓</span>
            )}
          </div>
          <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-[#11ff99] rounded-full"
              animate={{ width: `${predictions.length > 0 ? (answeredCount / predictions.length) * 100 : 0}%` }}
              transition={{ duration: 0.4 }}
            />
          </div>
        </div>
      )}

      {/* Prediction cards */}
      <div className="px-4 space-y-4">
        {generating && predictions.length === 0 && (
          <div className="flex items-center gap-3 py-8 justify-center">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
              className="w-5 h-5 rounded-full border-2 border-[rgba(214,235,253,0.19)] border-t-[#11ff99]"
            />
            <span className="text-[#464a4d] text-sm">Generating predictions with Claude…</span>
          </div>
        )}
        {predictions.map((pred, i) => (
          <motion.div
            key={pred.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
          >
            <PredictionCard
              pred={pred}
              showVotes={showVotes.has(pred.id)}
              onAnswer={onAnswer}
              phase="pregame"
            />
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

// ── Live Watch Screen ─────────────────────────────────────────────────────────

function LiveWatchScreen({
  half, liveData, homeTeam, awayTeam, answeredCount, totalCount,
}: {
  half: "first" | "second";
  liveData: LiveScoreData | null;
  homeTeam: string;
  awayTeam: string;
  answeredCount: number;
  totalCount: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="flex-1 flex flex-col items-center justify-center px-6 py-12 gap-6"
    >
      {/* Live indicator */}
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-[#ff2047] live-pulse" />
        <span className="text-xs font-bold uppercase tracking-widest text-[#ff2047]">Live</span>
        <span className="text-[#464a4d] text-xs">· {half === "first" ? "First" : "Second"} Half</span>
      </div>

      {/* Score */}
      {liveData && (
        <div className="bg-white/[0.03] border border-[rgba(214,235,253,0.19)] rounded-2xl px-8 py-5 text-center">
          <div className="flex items-center gap-6 justify-center">
            <div className="text-center">
              <p className="text-xs text-[#464a4d] mb-1 uppercase tracking-wider">{homeTeam}</p>
              <p className="text-4xl font-black tabular-nums">{liveData.home_score}</p>
            </div>
            <div className="flex flex-col items-center gap-1">
              <span className="text-[#464a4d] text-2xl font-thin">–</span>
              {liveData.clock && (
                <span className="text-xs font-mono text-[#11ff99]">{liveData.clock}&prime;</span>
              )}
            </div>
            <div className="text-center">
              <p className="text-xs text-[#464a4d] mb-1 uppercase tracking-wider">{awayTeam}</p>
              <p className="text-4xl font-black tabular-nums">{liveData.away_score}</p>
            </div>
          </div>
        </div>
      )}

      {/* Predictions status */}
      <div className="text-center">
        <p className="text-lg font-bold mb-1">
          {answeredCount < totalCount
            ? `${answeredCount}/${totalCount} predictions answered`
            : "Your predictions are locked in ✓"}
        </p>
        <p className="text-[#464a4d] text-sm">
          {half === "first"
            ? "Results will be revealed at half time"
            : "Results will be revealed at full time"}
        </p>
      </div>

      {/* Waiting animation */}
      <div className="flex gap-2 mt-2">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="w-2 h-2 rounded-full bg-[#464a4d]"
            animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.2, 0.8] }}
            transition={{ repeat: Infinity, duration: 1.5, delay: i * 0.25 }}
          />
        ))}
      </div>
    </motion.div>
  );
}

// ── Half Time Screen ──────────────────────────────────────────────────────────

function HalftimeScreen({
  homeTeam, awayTeam, liveData, firstHalfPreds, secondHalfPreds,
  session, leaderboard, showVotes, generating, onAnswer,
}: {
  homeTeam: string; awayTeam: string;
  liveData: LiveScoreData | null;
  firstHalfPreds: MatchPrediction[];
  secondHalfPreds: MatchPrediction[];
  session: PredictionSession | null;
  leaderboard: SimulatedRanker[];
  showVotes: Set<string>;
  generating: boolean;
  onAnswer: (predId: string, optId: string) => void;
}) {
  const [tab, setTab] = useState<"second" | "scores" | "ranks">("second");
  const answered = firstHalfPreds.filter((p) => p.userAnswer).length;
  const myRow = leaderboard.find((r) => r.isYou);

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="flex-1 pb-8"
    >
      {/* Halftime banner */}
      <div className="bg-[rgba(255,208,0,0.05)] border-b border-[rgba(255,208,0,0.15)] px-4 py-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[2px] text-[#ffc53d] mb-0.5">Half Time</p>
            <p className="text-sm text-[#a1a4a5]">{homeTeam} vs {awayTeam}</p>
          </div>
          {liveData && (
            <div className="text-right">
              <p className="text-3xl font-black tabular-nums">
                {liveData.home_score} – {liveData.away_score}
              </p>
            </div>
          )}
        </div>
        {/* My score pill */}
        <div className="flex items-center gap-3">
          <div className="bg-white/[0.04] border border-[rgba(214,235,253,0.12)] rounded-full px-3 py-1.5 flex items-center gap-2">
            <Zap size={12} className="text-[#11ff99]" />
            <span className="text-xs font-bold text-[#11ff99]">{session?.totalPoints ?? 0} pts</span>
          </div>
          <div className="bg-white/[0.04] border border-[rgba(214,235,253,0.12)] rounded-full px-3 py-1.5 flex items-center gap-2">
            <span className="text-xs text-[#a1a4a5]">{answered} / {firstHalfPreds.length} answered</span>
          </div>
          {myRow && (
            <div className="bg-white/[0.04] border border-[rgba(214,235,253,0.12)] rounded-full px-3 py-1.5 flex items-center gap-2">
              <Trophy size={12} className="text-[#ffc53d]" />
              <span className="text-xs text-[#ffc53d] font-bold">#{myRow.rank}</span>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 px-4 pt-4 pb-3">
        {[
          { id: "second" as const, label: "2nd Half Preds" },
          { id: "scores" as const, label: "1st Half Results" },
          { id: "ranks" as const, label: "Rankings" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={[
              "flex-1 py-2 text-xs font-bold rounded-full transition-all",
              tab === t.id
                ? "bg-white text-black"
                : "bg-white/[0.04] text-[#a1a4a5] border border-[rgba(214,235,253,0.12)]",
            ].join(" ")}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="px-4">
        {/* Second half predictions */}
        {tab === "second" && (
          <div className="space-y-4">
            <p className="text-[#464a4d] text-xs mb-3">
              Second half is about to start. Lock in your predictions.
            </p>
            {generating && secondHalfPreds.length === 0 && (
              <div className="flex items-center gap-3 py-8 justify-center">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
                  className="w-5 h-5 rounded-full border-2 border-[rgba(214,235,253,0.19)] border-t-[#11ff99]"
                />
                <span className="text-[#464a4d] text-sm">Generating second half predictions…</span>
              </div>
            )}
            {secondHalfPreds.map((pred, i) => (
              <motion.div
                key={pred.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
              >
                <PredictionCard
                  pred={pred}
                  showVotes={showVotes.has(pred.id)}
                  onAnswer={onAnswer}
                  phase="halftime"
                />
              </motion.div>
            ))}
          </div>
        )}

        {/* First-half results (vote bars) */}
        {tab === "scores" && (
          <div className="space-y-4">
            <p className="text-[#464a4d] text-xs mb-3">
              How the community voted on first-half predictions.
            </p>
            {firstHalfPreds.map((pred, i) => (
              <motion.div
                key={pred.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <PredictionCard
                  pred={pred}
                  showVotes={true}
                  onAnswer={() => {}}
                  phase="results"
                />
              </motion.div>
            ))}
          </div>
        )}

        {/* Leaderboard */}
        {tab === "ranks" && (
          <LeaderboardPanel leaderboard={leaderboard} />
        )}
      </div>
    </motion.div>
  );
}

// ── Full Time Screen ──────────────────────────────────────────────────────────

function FulltimeScreen({
  homeTeam, awayTeam, liveData, session, leaderboard, answeredCount,
}: {
  homeTeam: string; awayTeam: string;
  liveData: LiveScoreData | null;
  session: PredictionSession | null;
  leaderboard: SimulatedRanker[];
  answeredCount: number;
}) {
  const myRow = leaderboard.find((r) => r.isYou);
  const totalPreds = session?.predictions.length ?? 0;

  const handleShare = () => {
    const score = liveData ? `${liveData.home_score}–${liveData.away_score}` : "?–?";
    const txt = `⚽ GURU Predictions\n${homeTeam} ${score} ${awayTeam}\n\n${answeredCount}/${totalPreds} answered · ${session?.totalPoints ?? 0} pts${myRow ? ` · #${myRow.rank} ranking` : ""}\n\ngurutrivia.vercel.app`;
    navigator.clipboard.writeText(txt).catch(() => {});
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="flex-1 pb-8"
    >
      {/* Final score */}
      <div className="px-4 pt-5 pb-4 border-b border-[rgba(214,235,253,0.19)]">
        <p className="text-xs font-bold uppercase tracking-[2px] text-[#464a4d] mb-2">Full Time</p>
        <div className="flex items-center gap-4 mb-4">
          <div className="flex-1 text-center">
            <p className="text-xs text-[#464a4d] mb-1 uppercase tracking-wider truncate">{homeTeam}</p>
            <p className="text-5xl font-black">{liveData?.home_score ?? "–"}</p>
          </div>
          <div className="text-[#464a4d] text-3xl font-thin">–</div>
          <div className="flex-1 text-center">
            <p className="text-xs text-[#464a4d] mb-1 uppercase tracking-wider truncate">{awayTeam}</p>
            <p className="text-5xl font-black">{liveData?.away_score ?? "–"}</p>
          </div>
        </div>
        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Points", value: session?.totalPoints ?? 0, color: "text-[#11ff99]" },
            { label: "Answered", value: `${answeredCount}/${totalPreds}`, color: "text-[#f0f0f0]" },
            { label: "Rank", value: myRow ? `#${myRow.rank}` : "–", color: "text-[#ffc53d]" },
          ].map((s) => (
            <div key={s.label} className="bg-white/[0.03] border border-[rgba(214,235,253,0.12)] rounded-xl p-3 text-center">
              <p className={`text-xl font-black ${s.color}`}>{s.value}</p>
              <p className="text-[10px] text-[#464a4d] uppercase tracking-wider mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Leaderboard */}
      <div className="px-4 pt-4">
        <p className="text-xs font-bold uppercase tracking-[1.5px] text-[#464a4d] mb-3">Final Rankings</p>
        <LeaderboardPanel leaderboard={leaderboard} />
      </div>

      {/* Share */}
      <div className="px-4 pt-5">
        <button
          onClick={handleShare}
          className="w-full py-3.5 bg-[rgba(17,255,153,0.08)] border border-[rgba(17,255,153,0.25)] rounded-full text-[#11ff99] font-bold text-sm hover:bg-[rgba(17,255,153,0.14)] transition-colors active:scale-[0.98]"
        >
          ⬆ Share your results
        </button>
        <Link
          href="/"
          className="mt-3 flex items-center justify-center gap-1 text-[#464a4d] text-sm py-2"
        >
          Back to home <ChevronRight size={14} />
        </Link>
      </div>
    </motion.div>
  );
}

// ── Prediction Card (Polymarket-style) ────────────────────────────────────────

function PredictionCard({
  pred, showVotes, onAnswer, phase,
}: {
  pred: MatchPrediction;
  showVotes: boolean;
  onAnswer: (predId: string, optId: string) => void;
  phase: "pregame" | "halftime" | "results";
}) {
  const [revealed, setRevealed] = useState(showVotes || !!pred.userAnswer);

  useEffect(() => {
    if (showVotes || pred.userAnswer) setRevealed(true);
  }, [showVotes, pred.userAnswer]);

  const tv = totalVotes(pred);
  const answered = !!pred.userAnswer;
  const locked = phase === "results" || answered;

  // Leading option
  const leadOpt = pred.options.reduce((max, o) => (o.votes > max.votes ? o : max), pred.options[0]!);

  return (
    <div
      className={[
        "bg-white/[0.03] border rounded-2xl overflow-hidden transition-colors",
        answered
          ? "border-[rgba(17,255,153,0.2)]"
          : "border-[rgba(214,235,253,0.19)]",
      ].join(" ")}
    >
      {/* Top */}
      <div className="px-4 pt-4 pb-3">
        {/* Meta row */}
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-[1.5px] text-[#464a4d]">
              {pred.half === "first_half" ? "1st Half" : "2nd Half"}
            </span>
          </div>
          {/* Leading percentage pill — Polymarket style */}
          {tv > 0 && (
            <div className="flex items-center gap-1.5 bg-white/[0.04] border border-[rgba(214,235,253,0.1)] rounded-full px-2.5 py-0.5">
              <Users size={9} className="text-[#464a4d]" />
              <span className="text-[10px] font-mono font-bold text-[#a1a4a5]">
                {pct(leadOpt.votes, tv)}% {leadOpt.label}
              </span>
            </div>
          )}
        </div>

        {/* Question */}
        <p className="text-base font-bold leading-snug mb-1">{pred.question}</p>

        {/* Context hint */}
        {pred.context && (
          <p className="text-xs text-[#464a4d] mb-3 leading-relaxed">{pred.context}</p>
        )}

        {/* Answer buttons */}
        {!locked && (
          <div className="flex gap-2 mt-3">
            {pred.options.map((opt) => (
              <button
                key={opt.id}
                onClick={() => onAnswer(pred.id, opt.id)}
                className="flex-1 py-3 px-2 rounded-xl border border-[rgba(214,235,253,0.19)] bg-transparent text-sm font-bold text-[#f0f0f0] hover:border-[#11ff99] hover:text-[#11ff99] hover:bg-[rgba(17,255,153,0.06)] transition-all active:scale-[0.97] text-center"
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}

        {/* Answered state — show picked button */}
        {answered && !revealed && (
          <div className="flex gap-2 mt-3">
            {pred.options.map((opt) => {
              const isPicked = opt.id === pred.userAnswer;
              return (
                <div
                  key={opt.id}
                  className={[
                    "flex-1 py-3 px-2 rounded-xl border text-sm font-bold text-center transition-all",
                    isPicked
                      ? "border-[#11ff99] bg-[rgba(17,255,153,0.08)] text-[#11ff99]"
                      : "border-[rgba(214,235,253,0.08)] bg-transparent text-[#464a4d]",
                  ].join(" ")}
                >
                  {opt.label}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Vote distribution bars — Polymarket style */}
      {revealed && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="px-4 pb-4"
        >
          <div className="space-y-2.5 mt-1">
            {pred.options.map((opt) => {
              const p = pct(opt.votes, tv);
              const isPicked = opt.id === pred.userAnswer;
              const isLeading = opt.id === leadOpt.id;
              return (
                <div key={opt.id}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={[
                          "text-xs font-semibold",
                          isPicked
                            ? "text-[#11ff99]"
                            : isLeading
                            ? "text-[#f0f0f0]"
                            : "text-[#a1a4a5]",
                        ].join(" ")}
                      >
                        {opt.label}
                      </span>
                      {isPicked && (
                        <span className="text-[9px] bg-[rgba(17,255,153,0.12)] text-[#11ff99] border border-[rgba(17,255,153,0.25)] rounded-full px-1.5 py-0.5 font-bold">
                          YOUR PICK
                        </span>
                      )}
                    </div>
                    <span
                      className={[
                        "text-xs font-mono font-bold",
                        isPicked ? "text-[#11ff99]" : isLeading ? "text-[#f0f0f0]" : "text-[#464a4d]",
                      ].join(" ")}
                    >
                      {p}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${p}%` }}
                      transition={{ duration: 0.7, ease: "easeOut" }}
                      className={[
                        "h-full rounded-full",
                        isPicked
                          ? "bg-[#11ff99]"
                          : isLeading
                          ? "bg-white/40"
                          : "bg-white/[0.12]",
                      ].join(" ")}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-[#464a4d] mt-2.5 flex items-center gap-1">
            <Users size={9} />
            {(tv + 1).toLocaleString()} community predictions
          </p>
        </motion.div>
      )}

      {/* Footer — show votes tease */}
      {!revealed && answered && (
        <div className="px-4 py-2.5 border-t border-[rgba(214,235,253,0.08)] flex items-center justify-between">
          <span className="text-[11px] text-[#464a4d]">
            Your pick: <span className="text-[#f0f0f0] font-semibold">{pred.options.find((o) => o.id === pred.userAnswer)?.label}</span>
          </span>
          <button
            onClick={() => setRevealed(true)}
            className="text-[11px] text-[#11ff99] font-semibold flex items-center gap-0.5"
          >
            See votes <ChevronRight size={11} />
          </button>
        </div>
      )}

      {/* Footer — locked (results view) */}
      {phase === "results" && !pred.userAnswer && (
        <div className="px-4 py-2.5 border-t border-[rgba(214,235,253,0.08)]">
          <span className="text-[11px] text-[#464a4d]">You didn&apos;t answer this one</span>
        </div>
      )}
    </div>
  );
}

// ── Leaderboard Panel ─────────────────────────────────────────────────────────

function LeaderboardPanel({ leaderboard }: { leaderboard: SimulatedRanker[] }) {
  return (
    <div className="space-y-2">
      {leaderboard.slice(0, 9).map((entry) => (
        <motion.div
          key={entry.username}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          className={[
            "flex items-center gap-3 px-3 py-3 rounded-xl border transition-colors",
            entry.isYou
              ? "bg-[rgba(17,255,153,0.05)] border-[rgba(17,255,153,0.2)]"
              : "bg-white/[0.02] border-[rgba(214,235,253,0.1)]",
          ].join(" ")}
        >
          <span
            className={[
              "text-sm font-black w-6 text-center tabular-nums flex-shrink-0",
              entry.rank === 1 ? "text-[#ffc53d]" : entry.rank <= 3 ? "text-[#a1a4a5]" : "text-[#464a4d]",
            ].join(" ")}
          >
            {entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : entry.rank === 3 ? "🥉" : `#${entry.rank}`}
          </span>
          <span className="text-lg flex-shrink-0">{entry.avatar}</span>
          <span className={["text-sm font-semibold flex-1 truncate", entry.isYou ? "text-[#11ff99]" : "text-[#f0f0f0]"].join(" ")}>
            {entry.username}
            {entry.isYou && <span className="text-[10px] text-[#11ff99] ml-1.5 opacity-70">(you)</span>}
          </span>
          <div className="text-right flex-shrink-0">
            <p className={["text-sm font-black tabular-nums", entry.isYou ? "text-[#11ff99]" : "text-[#f0f0f0]"].join(" ")}>
              {entry.points}
            </p>
            <p className="text-[10px] text-[#464a4d]">{entry.correct} correct</p>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

