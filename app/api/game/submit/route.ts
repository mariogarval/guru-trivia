import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { Database } from "@/lib/supabase/database.types";
import { calculatePoints } from "@/lib/scoring";
import { calculateLivesRegen } from "@/lib/lives";
import type { Profile } from "@/types";

interface SubmitBody {
  questionId: string;
  selectedIndex: number | null; // null = timeout
  timeTaken: number;
  streak: number;
}

export async function POST(request: NextRequest) {
  const supabase = createRouteHandlerClient<Database>({ cookies });
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body: SubmitBody = await request.json();
  const { questionId, selectedIndex, timeTaken, streak } = body;

  // Validate inputs
  if (timeTaken < 0 || timeTaken > 15) {
    return NextResponse.json({ error: "Invalid time" }, { status: 400 });
  }

  // Fetch the question server-side to validate answer
  const { data: question } = await supabase
    .from("questions")
    .select("*")
    .eq("id", questionId)
    .single();

  if (!question) {
    return NextResponse.json({ error: "Question not found" }, { status: 404 });
  }

  // Check if already answered
  const { data: existing } = await supabase
    .from("user_answers")
    .select("id")
    .eq("user_id", session.user.id)
    .eq("question_id", questionId)
    .single();

  if (existing) {
    return NextResponse.json({ error: "Already answered" }, { status: 409 });
  }

  const q = question as unknown as {
    correct_answer_index: number;
    difficulty: string;
    explanation: string | null;
  };

  const isCorrect =
    selectedIndex !== null &&
    selectedIndex === q.correct_answer_index;

  let pointsEarned = 0;
  if (isCorrect) {
    const result = calculatePoints(
      q.difficulty as "easy" | "medium" | "hard",
      timeTaken,
      streak
    );
    pointsEarned = result.total;
  }

  // Fetch current profile (with life regen)
  const { data: profileRow } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", session.user.id)
    .single();

  if (!profileRow) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const profile = calculateLivesRegen(profileRow as Profile);
  const newLives = isCorrect || selectedIndex === null
    ? Math.max(0, profile.lives - (isCorrect ? 0 : 1)) // timeout = lose life
    : Math.max(0, profile.lives - 1); // wrong answer = lose life

  const livesLost = profile.lives - newLives;

  // Persist answer
  await (supabase.from("user_answers") as any).insert({
    user_id: session.user.id,
    question_id: questionId,
    is_correct: isCorrect,
    time_taken: timeTaken,
    points_earned: pointsEarned,
  });

  // Update profile
  await (supabase
    .from("profiles") as any)
    .update({
      total_points: profile.total_points + pointsEarned,
      lives: newLives,
      last_life_regen: profile.last_life_regen,
    })
    .eq("id", session.user.id);

  return NextResponse.json({
    isCorrect,
    correctIndex: q.correct_answer_index,
    explanation: q.explanation,
    pointsEarned,
    livesLost,
    newLives,
    newTotalPoints: profile.total_points + pointsEarned,
  });
}
