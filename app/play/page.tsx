"use client";

import { Suspense, useEffect, useCallback, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Heart, Flame, Trophy, Share2, Check, Home } from "lucide-react";
import Link from "next/link";
import CountdownBar from "@/components/game/CountdownBar";
import AnswerButton from "@/components/game/AnswerButton";
import FeedbackOverlay from "@/components/game/FeedbackOverlay";
import MatchBanner from "@/components/game/MatchBanner";
import PredictionsScreen from "@/components/game/PredictionsScreen";
import AdBanner from "@/components/paywall/AdBanner";
import UpsellModal from "@/components/paywall/UpsellModal";
import WaitlistSheet from "@/components/paywall/WaitlistSheet";
import { useGame } from "@/hooks/useGame";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { getDifficultyColor, getDifficultyLabel } from "@/lib/scoring";
import { QUESTIONS_PER_SET, MAX_LIVES } from "@/types";

export default function PlayPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-[#11ff99]/20 border-t-[#11ff99] rounded-full animate-spin" />
        </div>
      }
    >
      <PlayContent />
    </Suspense>
  );
}

function PlayContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const matchId = searchParams.get("match") ?? null;
  const category = searchParams.get("category") ?? null;
  const teams = searchParams.get("teams") ?? null;
  const league = searchParams.get("league") ?? null;
  const homeCrest = searchParams.get("homeCrest") ?? undefined;
  const awayCrest = searchParams.get("awayCrest") ?? undefined;

  // Parse team names from "Home Team,Away Team" format
  const teamNames = teams?.split(",").map((t) => t.trim()) ?? [];
  const homeTeam = teamNames[0] ?? "";
  const awayTeam = teamNames[1] ?? "";
  const hasMatchContext = !!matchId && !!teams;

  const { userId, tier } = useAuth();
  const { t, language } = useLanguage();
  const isFree = tier === "free";

  const {
    phase,
    currentIndex,
    currentQuestion,
    answers,
    streak,
    totalPoints,
    lives,
    feedback,
    startGame,
    submitAnswer,
    nextQuestion,
    restartGame,
    errorMessage,
  } = useGame(userId);

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const startTimeRef = useRef<number>(0);

  // Paywall state
  const [showUpsellModal, setShowUpsellModal] = useState(false);
  const [showWaitlist, setShowWaitlist] = useState(false);
  const upsellShownRef = useRef(false); // only show once per session

  // Predictions gate — show before trivia for live matches that have predictions
  const [predictionsPhase, setPredictionsPhase] = useState<"checking" | "show" | "done">("checking");

  useEffect(() => {
    if (!hasMatchContext || !matchId) {
      setPredictionsPhase("done");
      return;
    }
    fetch(`/api/predictions?matchId=${encodeURIComponent(matchId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.predictions?.length > 0) {
          setPredictionsPhase("show");
        } else {
          setPredictionsPhase("done");
        }
      })
      .catch(() => setPredictionsPhase("done"));
  }, [matchId, hasMatchContext]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (predictionsPhase !== "done") return;
    startGame(matchId, category, teams, league);
  }, [predictionsPhase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Record session score for 2× bonus resolution when trivia finishes
  useEffect(() => {
    if (phase !== "results" || !hasMatchContext || !matchId || !userId || totalPoints === 0) return;
    fetch("/api/predictions/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchId, triviaPoints: totalPoints }),
    }).catch(() => {});
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Q5 upsell: show modal for free users between question 4→5 (index 4 = Q5)
  useEffect(() => {
    if (
      phase === "playing" &&
      currentIndex === 4 &&
      isFree &&
      !upsellShownRef.current
    ) {
      upsellShownRef.current = true;
      setShowUpsellModal(true);
    }
  }, [phase, currentIndex, isFree]);

  useEffect(() => {
    if (phase === "playing") {
      setSelectedIndex(null);
      startTimeRef.current = performance.now();
    }
  }, [phase]);

  const handleAnswer = useCallback(
    (index: number) => {
      if (phase !== "playing" || selectedIndex !== null) return;
      const timeTaken = (performance.now() - startTimeRef.current) / 1000;
      setSelectedIndex(index);
      submitAnswer(index, Math.min(timeTaken, 12));
    },
    [phase, selectedIndex, submitAnswer]
  );

  const handleTimeout = useCallback(() => {
    if (phase !== "playing" || selectedIndex !== null) return;
    submitAnswer(null, 12);
  }, [phase, selectedIndex, submitAnswer]);

  // ---- Predictions gate ----
  if (predictionsPhase === "checking") {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#11ff99]/20 border-t-[#11ff99] rounded-full animate-spin" />
      </div>
    );
  }

  if (predictionsPhase === "show") {
    return (
      <PredictionsScreen
        matchId={matchId!}
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        userTier={tier}
        onComplete={() => setPredictionsPhase("done")}
      />
    );
  }

  // ---- Loading ----
  if (phase === "loading") {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-[#11ff99]/20 border-t-[#11ff99] rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[#464a4d] text-sm">{t("play.loading")}</p>
        </div>
      </div>
    );
  }

  // ---- No Lives ----
  if (phase === "no_lives") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <div className="text-6xl mb-6">💔</div>
        <h2 className="text-2xl font-bold text-[#f0f0f0] mb-2">Out of Lives</h2>
        <p className="text-[#a1a4a5] mb-8 max-w-xs">
          Your lives are recharging. Come back in a few hours or purchase more.
        </p>
        <Link
          href="/"
          className="bg-[#11ff99] text-black font-bold py-3 px-8 rounded-full"
        >
          Go Home
        </Link>
      </div>
    );
  }

  // ---- Error ----
  if (phase === "error") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-12 h-12 rounded-full bg-[#ff2047]/10 border border-[#ff2047]/20 flex items-center justify-center mb-4">
          <span className="text-[#ff2047] text-xl">!</span>
        </div>
        <h2 className="text-xl font-bold text-[#f0f0f0] mb-2">Something went wrong</h2>
        <p className="text-[#a1a4a5] mb-6 text-sm">{errorMessage}</p>
        <button
          onClick={restartGame}
          className="bg-[#11ff99] text-black font-bold py-3 px-8 rounded-full"
        >
          Try Again
        </button>
      </div>
    );
  }

  // ---- Results ----
  if (phase === "results") {
    const correctCount = answers.filter((a) => a.isCorrect).length;
    const accuracy = Math.round((correctCount / answers.length) * 100);
    const bestStreak = Math.max(
      0,
      ...answers.reduce<number[]>((acc, a) => {
        const last = acc.length;
        if (a.isCorrect) {
          acc[last - 1] = (acc[last - 1] ?? 0) + 1;
        } else {
          acc.push(0);
        }
        return acc;
      }, [0])
    );

    return (
      <div className="flex-1 flex flex-col p-6 pb-24">
        <div className="text-center mb-8 pt-6">
          <div className="text-5xl mb-3">
            {accuracy >= 80 ? "🏆" : accuracy >= 60 ? "⭐" : "📚"}
          </div>
          <h1 className="text-4xl font-black text-[#f0f0f0] mb-1 tracking-tight">
            {totalPoints.toLocaleString()}
          </h1>
          <p className="text-[#464a4d] text-sm">{t("play.pointsEarned")}</p>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-8">
          {[
            { label: t("play.correct"), value: `${correctCount}/${answers.length}` },
            { label: t("play.accuracy"), value: `${accuracy}%` },
            { label: t("play.bestStreak"), value: bestStreak.toString() },
          ].map((stat) => (
            <div
              key={stat.label}
              className="bg-white/[0.03] border border-[rgba(214,235,253,0.19)] rounded-2xl p-3 text-center"
            >
              <p className="text-xl font-bold text-[#f0f0f0]">{stat.value}</p>
              <p className="text-[11px] text-[#464a4d] mt-0.5 uppercase tracking-wider">{stat.label}</p>
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <button
            onClick={restartGame}
            className="w-full bg-[#11ff99] text-black font-bold py-4 rounded-full text-base active:scale-[0.98] transition-transform"
          >
            {t("play.playAgain")}
          </button>
          <Link
            href="/leaderboard"
            className="block w-full text-center bg-transparent border border-[rgba(214,235,253,0.19)] font-semibold py-4 rounded-full text-[#f0f0f0] hover:bg-white/5 transition-colors"
          >
            {t("play.viewLeaderboard")}
          </Link>
          <button
            onClick={async () => {
              const scoreCard = [
                "⚽ FUTGURU Trivia",
                `🏆 ${totalPoints.toLocaleString()} ${t("play.pts")}`,
                `🎯 ${accuracy}% accuracy`,
                bestStreak >= 3 ? `🔥 ${bestStreak} streak` : "",
                "",
                t("share.challenge"),
              ]
                .filter(Boolean)
                .join("\n");

              if (navigator.share) {
                try {
                  await navigator.share({ title: "FUTGURU Trivia", text: scoreCard });
                } catch {
                  // user cancelled
                }
              } else {
                try {
                  await navigator.clipboard.writeText(scoreCard);
                  setShareCopied(true);
                  setTimeout(() => setShareCopied(false), 2000);
                } catch {
                  // ignore
                }
              }
            }}
            className="w-full flex items-center justify-center gap-2 border border-[rgba(214,235,253,0.12)] font-medium py-4 rounded-full text-[#464a4d] hover:text-[#a1a4a5] hover:border-[rgba(214,235,253,0.19)] transition-all"
          >
            {shareCopied ? (
              <>
                <Check size={16} className="text-[#11ff99]" />
                <span className="text-[#11ff99]">{t("play.copied")}</span>
              </>
            ) : (
              <>
                <Share2 size={16} />
                {t("play.shareScore")}
              </>
            )}
          </button>
          <Link
            href="/"
            className="w-full flex items-center justify-center gap-2 border border-[rgba(214,235,253,0.12)] font-medium py-4 rounded-full text-[#464a4d] hover:text-[#a1a4a5] hover:border-[rgba(214,235,253,0.19)] transition-all"
          >
            <Home size={16} />
            {t("play.goHome")}
          </Link>
        </div>
      </div>
    );
  }

  // ---- Playing / Feedback ----
  if (!currentQuestion) return null;

  const progressPct =
    ((currentIndex + (phase === "feedback" ? 1 : 0)) / QUESTIONS_PER_SET) * 100;

  const getButtonState = (i: number) => {
    if (phase === "playing" || !feedback) return "idle";
    if (i === feedback.correctIndex) {
      return selectedIndex === i ? "correct" : "revealed";
    }
    if (i === selectedIndex && !feedback.isCorrect) return "wrong";
    return "idle";
  };

  return (
    <div className="flex-1 flex flex-col relative no-select">
      {/* Match context banner */}
      {hasMatchContext && (
        <div className="pt-2">
          <MatchBanner
            matchId={matchId!}
            homeTeam={homeTeam}
            awayTeam={awayTeam}
            homeCrest={homeCrest}
            awayCrest={awayCrest}
            league={league ?? undefined}
          />
        </div>
      )}

      {/* Header */}
      <div className="px-4 pt-4 pb-3 space-y-3">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="p-2 -ml-2 text-[#464a4d] hover:text-[#f0f0f0] transition-colors"
          >
            <ArrowLeft size={20} strokeWidth={1.5} />
          </Link>
          <span className="text-sm font-medium text-[#464a4d]">
            {t("play.question")} {currentIndex + 1} / {QUESTIONS_PER_SET}
          </span>
          <div className="flex items-center gap-3">
            {streak >= 3 && (
              <span className="flex items-center gap-1 text-[#ffc53d] text-sm font-bold">
                <Flame size={15} className="fill-[#ffc53d]" />
                {streak}
              </span>
            )}
            <div className="flex items-center gap-1">
              {Array.from({ length: MAX_LIVES }).map((_, i) => (
                <Heart
                  key={i}
                  size={16}
                  className={
                    i < lives
                      ? "fill-[#ff2047] text-[#ff2047]"
                      : "fill-white/10 text-white/10"
                  }
                />
              ))}
            </div>
          </div>
        </div>

        {/* Timer bar */}
        <CountdownBar
          running={phase === "playing"}
          onExpire={handleTimeout}
          key={`timer-${currentIndex}`}
        />
      </div>

      {/* Question */}
      <div className="px-4 flex-1 flex flex-col">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="flex-1 flex flex-col"
          >
            {/* Difficulty + Points badge */}
            <div className="flex items-center gap-2 mb-4">
              <span
                className={`text-xs font-semibold uppercase tracking-wider ${getDifficultyColor(
                  currentQuestion.difficulty
                )}`}
              >
                {getDifficultyLabel(currentQuestion.difficulty)}
              </span>
              <span className="text-xs text-[#464a4d]">·</span>
              <span className="flex items-center gap-1 text-xs text-[#ffc53d]">
                <Trophy size={11} />
                {currentQuestion.difficulty === "easy"
                  ? "1–1.5"
                  : currentQuestion.difficulty === "medium"
                  ? "2–3"
                  : "3–4.5"}{" "}
                {t("play.pts")}
              </span>
              {(totalPoints > 0 || currentIndex > 0) && (
                <span className="text-xs text-[#464a4d] ml-auto">
                  {totalPoints.toLocaleString()} {t("play.pts")}
                </span>
              )}
            </div>

            {/* Question text */}
            <p className="text-xl font-semibold text-[#f0f0f0] leading-snug mb-4">
              {currentQuestion.question_text}
            </p>

            {/* Spacer — pushes answer buttons to bottom of available area */}
            <div className="flex-1" />

            {/* Answer buttons */}
            <div className={`space-y-3 ${phase === "feedback" ? "pb-52" : "pb-4"}`}>
              {currentQuestion.options.map((option, i) => (
                <AnswerButton
                  key={i}
                  text={option}
                  index={i}
                  state={getButtonState(i)}
                  disabled={phase === "feedback" || selectedIndex !== null}
                  onClick={() => handleAnswer(i)}
                />
              ))}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Ad banner — shown between questions for free users (phase = feedback) */}
      {isFree && phase === "feedback" && (
        <AdBanner onUpgrade={() => { setShowUpsellModal(true); }} />
      )}

      {/* Feedback overlay */}
      {feedback && (
        <FeedbackOverlay
          show={phase === "feedback"}
          isCorrect={feedback.isCorrect}
          pointsEarned={feedback.pointsEarned}
          explanation={feedback.explanation}
          speedLabel={feedback.speedLabel}
          streakBonus={feedback.streakBonus}
          questionId={currentQuestion?.id}
          onNext={nextQuestion}
        />
      )}

      {/* Q5 upsell modal */}
      {showUpsellModal && (
        <UpsellModal
          onUpgrade={() => { setShowUpsellModal(false); setShowWaitlist(true); }}
          onDismiss={() => setShowUpsellModal(false)}
        />
      )}

      {/* Waitlist sheet (opened from upsell modal) */}
      {showWaitlist && (
        <WaitlistSheet
          tierName="Ad-Free Pass"
          tierPrice="$2.99/month"
          tierDescription="Play without interruptions for the full World Cup."
          tierPerks={[
            "Zero ads between questions",
            "Same great trivia, cleaner experience",
            "Cancel anytime",
          ]}
          tierInterest="ad_free"
          onDismiss={() => setShowWaitlist(false)}
        />
      )}
    </div>
  );
}
