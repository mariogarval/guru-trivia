"use client";

import { useState, useCallback, useRef } from "react";
import type { Question, AnsweredQuestion } from "@/types";
import { QUESTIONS_PER_SET } from "@/types";
import { calculatePoints } from "@/lib/scoring";

export type GamePhase =
  | "loading"
  | "playing"
  | "feedback"
  | "results"
  | "no_lives"
  | "error";

interface FeedbackState {
  isCorrect: boolean;
  correctIndex: number;
  explanation: string | null;
  pointsEarned: number;
  speedLabel: "fast" | "medium" | "slow" | null;
  streakBonus: number;
}

export interface UseGameReturn {
  phase: GamePhase;
  questions: Question[];
  currentIndex: number;
  currentQuestion: Question | null;
  answers: AnsweredQuestion[];
  streak: number;
  totalPoints: number;
  lives: number;
  feedback: FeedbackState | null;
  startGame: (matchId: string | null, category?: string | null, teams?: string | null, league?: string | null) => Promise<void>;
  submitAnswer: (selectedIndex: number | null, timeTaken: number) => Promise<void>;
  nextQuestion: () => void;
  restartGame: () => void;
  errorMessage: string | null;
}

export function useGame(userId: string | null): UseGameReturn {
  const [phase, setPhase] = useState<GamePhase>("loading");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<AnsweredQuestion[]>([]);
  const [streak, setStreak] = useState(0);
  const [totalPoints, setTotalPoints] = useState(0);
  const [lives, setLives] = useState(5);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const matchIdRef = useRef<string | null>(null);
  const categoryRef = useRef<string | null>(null);
  const teamsRef = useRef<string | null>(null);
  const leagueRef = useRef<string | null>(null);

  const currentQuestion = questions[currentIndex] ?? null;

  const startGame = useCallback(async (matchId: string | null, category: string | null = null, teams: string | null = null, league: string | null = null) => {
    setPhase("loading");
    setErrorMessage(null);
    matchIdRef.current = matchId;
    categoryRef.current = category;
    teamsRef.current = teams;
    leagueRef.current = league;

    try {
      // Check lives first
      const livesRes = await fetch("/api/game/lives");
      if (livesRes.ok) {
        const livesData = await livesRes.json();
        if (livesData.lives === 0) {
          setLives(0);
          setPhase("no_lives");
          return;
        }
        setLives(livesData.lives);
      }

      // Fetch questions
      const params = new URLSearchParams({ count: String(QUESTIONS_PER_SET) });
      if (matchId) params.set("match_id", matchId);
      if (category) params.set("category", category);
      if (teams) params.set("teams", teams);
      if (league) params.set("league", league);
      const url = `/api/questions?${params}`;

      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to load questions");

      const data = await res.json();
      const qs: Question[] = data.questions;

      if (!qs || qs.length === 0) {
        setErrorMessage("No questions available yet. Check back soon!");
        setPhase("error");
        return;
      }

      setQuestions(qs);
      setCurrentIndex(0);
      setAnswers([]);
      setStreak(0);
      setTotalPoints(0);
      setFeedback(null);
      setPhase("playing");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to start game");
      setPhase("error");
    }
  }, []);

  const submitAnswer = useCallback(
    async (selectedIndex: number | null, timeTaken: number) => {
      if (!currentQuestion || phase !== "playing") return;

      // Optimistic scoring for guest mode
      if (!userId) {
        // Guest mode: pick a random correct index to simulate (in real app, questions come pre-loaded)
        const correctIndex = Math.floor(Math.random() * 4); // placeholder for guest
        const isCorrect =
          selectedIndex !== null && selectedIndex === correctIndex;
        const pts = isCorrect
          ? calculatePoints(currentQuestion.difficulty, timeTaken, streak)
          : { total: 0, multiplier: 1, speedLabel: "slow" as const, streakBonus: 0, base: 0 };

        const newStreak = isCorrect ? streak + 1 : 0;
        const newLives = isCorrect ? lives : Math.max(0, lives - 1);

        setFeedback({
          isCorrect,
          correctIndex,
          explanation: null,
          pointsEarned: pts.total,
          speedLabel: isCorrect ? pts.speedLabel : null,
          streakBonus: pts.streakBonus,
        });
        setStreak(newStreak);
        setTotalPoints((p) => p + pts.total);
        setLives(newLives);
        setAnswers((prev) => [
          ...prev,
          {
            questionId: currentQuestion.id,
            selectedIndex,
            isCorrect,
            timeTaken,
            pointsEarned: pts.total,
          },
        ]);
        setPhase("feedback");
        return;
      }

      try {
        const res = await fetch("/api/game/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            questionId: currentQuestion.id,
            selectedIndex,
            timeTaken,
            streak,
          }),
        });

        if (!res.ok) {
          // On error, still advance gracefully
          setPhase("feedback");
          return;
        }

        const data = await res.json();
        const pts = data.isCorrect
          ? calculatePoints(currentQuestion.difficulty, timeTaken, streak)
          : { total: 0, multiplier: 1, speedLabel: "slow" as const, streakBonus: 0, base: 0 };

        setFeedback({
          isCorrect: data.isCorrect,
          correctIndex: data.correctIndex,
          explanation: data.explanation,
          pointsEarned: data.pointsEarned,
          speedLabel: data.isCorrect ? pts.speedLabel : null,
          streakBonus: pts.streakBonus,
        });
        setStreak(data.isCorrect ? streak + 1 : 0);
        setTotalPoints((p) => p + data.pointsEarned);
        setLives(data.newLives);
        setAnswers((prev) => [
          ...prev,
          {
            questionId: currentQuestion.id,
            selectedIndex,
            isCorrect: data.isCorrect,
            timeTaken,
            pointsEarned: data.pointsEarned,
          },
        ]);
        setPhase("feedback");
      } catch {
        setPhase("feedback");
      }
    },
    [currentQuestion, phase, streak, lives, userId]
  );

  const nextQuestion = useCallback(() => {
    const nextIndex = currentIndex + 1;
    if (nextIndex >= questions.length || lives === 0) {
      setPhase("results");
      return;
    }
    setCurrentIndex(nextIndex);
    setFeedback(null);
    setPhase("playing");
  }, [currentIndex, questions.length, lives]);

  const restartGame = useCallback(() => {
    setPhase("loading");
    startGame(matchIdRef.current, categoryRef.current, teamsRef.current, leagueRef.current);
  }, [startGame]);

  return {
    phase,
    questions,
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
  };
}
