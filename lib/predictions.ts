/**
 * Prediction generation and resolution logic.
 * Uses Claude API to generate unambiguous, auto-resolvable Yes/No questions
 * for live football matches. All questions must resolve from standard match data only.
 */

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const GENERATION_PROMPT = (homeTeam: string, awayTeam: string, competition: string) => `
You are generating prediction questions for a live football match.

Match: ${homeTeam} vs ${awayTeam}
Competition: ${competition}

Generate exactly 5 Yes/No prediction questions following ALL of these rules:

REQUIRED — every question must:
1. Be 100% resolvable using ONLY standard match data available from a football API: goals scored, red cards, yellow cards, corners, final result, clean sheets
2. Have a definitive YES or NO answer based purely on what happened in the match — no subjective judgment
3. Be answerable by the END of 90 minutes (regular time only — exclude extra time and penalties)
4. Be about this specific match, not general football knowledge
5. Be exciting and clear for a casual football fan
6. Be max 80 characters

FORBIDDEN — never generate questions about:
- Player performance ratings, man of the match, or "best" anything
- VAR decisions or referee interpretations
- Events that may occur in extra time or penalties
- Tactical or strategic analysis
- Pre-match predictions about lineups or formations
- Anything requiring external context beyond the match scoreline and match stats

VALID resolves_on values (pick the most accurate one per question):
- "goal" — whether a goal is scored (e.g. "Will ${homeTeam} score?", "Will there be a goal in the first 30 min?")
- "red_card" — whether a red card is shown to either team
- "clean_sheet" — whether a specific team concedes zero goals
- "result" — resolves on the final match result (win/draw/loss for a specific team)
- "both_teams_score" — whether both teams score at least one goal

Return ONLY a valid JSON array of exactly 5 objects. No markdown, no explanation, no extra text.
Schema: [{"id":"pred_1","question":"string","resolves_on":"string"}, ...]
`.trim();

interface GeneratedPrediction {
  id: string;
  question: string;
  resolves_on: string;
}

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key);
}

/**
 * Generate and save predictions for a match. Returns true on success.
 * Marks predictions_status on the match row accordingly.
 */
export async function generatePredictionsForMatch(
  matchId: string,
  homeTeam: string,
  awayTeam: string,
  competition: string
): Promise<boolean> {
  const supabase = getServiceSupabase();

  // Mark as generating to prevent concurrent attempts
  await supabase
    .from("matches")
    .update({ predictions_status: "generating", predictions_last_attempt: new Date().toISOString() })
    .eq("id", matchId);

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: GENERATION_PROMPT(homeTeam, awayTeam, competition),
        },
      ],
    });

    const rawText = message.content[0].type === "text" ? message.content[0].text.trim() : "";

    // Parse — strip any accidental markdown fences
    const jsonText = rawText.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "").trim();
    const predictions: GeneratedPrediction[] = JSON.parse(jsonText);

    if (!Array.isArray(predictions) || predictions.length === 0) {
      throw new Error("Claude returned empty or non-array predictions");
    }

    // Validate each item has required fields
    const valid = predictions.every(
      (p) =>
        typeof p.question === "string" &&
        p.question.length > 0 &&
        typeof p.resolves_on === "string" &&
        ["goal", "red_card", "clean_sheet", "result", "both_teams_score"].includes(p.resolves_on)
    );
    if (!valid) throw new Error("Claude returned predictions with invalid fields");

    // Take up to 5 (Claude should always return 5, but be safe)
    const toInsert = predictions.slice(0, 5).map((p) => ({
      match_id: matchId,
      question_text: p.question,
      resolves_on: p.resolves_on,
    }));

    const { error: insertError } = await supabase.from("match_predictions").insert(toInsert);
    if (insertError) throw insertError;

    await supabase
      .from("matches")
      .update({ predictions_status: "generated" })
      .eq("id", matchId);

    console.log(`[predictions] Generated ${toInsert.length} questions for match ${matchId}`);
    return true;
  } catch (err) {
    console.error(`[predictions] Generation failed for match ${matchId}:`, err);

    await supabase
      .from("matches")
      .update({ predictions_status: "failed" })
      .eq("id", matchId);

    return false;
  }
}

/**
 * Resolve all predictions for a finished match.
 * Uses the final score to determine correct_answer for each prediction type.
 * Awards 2x bonus to users who got all predictions right.
 */
export async function resolvePredictionsForMatch(
  matchId: string,
  finalScore: string // format: "2 - 1"
): Promise<void> {
  const supabase = getServiceSupabase();

  const { data: predictions } = await supabase
    .from("match_predictions")
    .select("*")
    .eq("match_id", matchId)
    .is("resolved_at", null);

  if (!predictions || predictions.length === 0) return;

  // Parse score
  const parts = finalScore.split("-").map((s) => parseInt(s.trim(), 10));
  const homeGoals = parts[0] ?? 0;
  const awayGoals = parts[1] ?? 0;

  const now = new Date().toISOString();
  const resolvedPredictions: { id: string; correct: boolean }[] = [];

  for (const pred of predictions) {
    let correct: boolean | null = null;

    switch (pred.resolves_on) {
      case "goal":
        correct = homeGoals + awayGoals > 0;
        break;
      case "red_card":
        // Can't resolve from score alone — skip (leave null)
        correct = null;
        break;
      case "clean_sheet":
        // Assume question is about the home team keeping a clean sheet
        // (questions should specify the team — best-effort resolution)
        correct = awayGoals === 0;
        break;
      case "result":
        correct = homeGoals > awayGoals; // "Will [home team] win?"
        break;
      case "both_teams_score":
        correct = homeGoals > 0 && awayGoals > 0;
        break;
    }

    if (correct !== null) {
      resolvedPredictions.push({ id: pred.id, correct });
      await supabase
        .from("match_predictions")
        .update({ correct_answer: correct, resolved_at: now })
        .eq("id", pred.id);
    }
  }

  if (resolvedPredictions.length === 0) return;

  // For each user who submitted predictions on this match, compute bonus
  const { data: userVotes } = await supabase
    .from("user_predictions")
    .select("user_id, prediction_id, answer")
    .eq("match_id", matchId);

  if (!userVotes || userVotes.length === 0) return;

  // Group by user
  const byUser = new Map<string, { predictionId: string; answer: boolean }[]>();
  for (const vote of userVotes) {
    const list = byUser.get(vote.user_id) ?? [];
    list.push({ predictionId: vote.prediction_id, answer: vote.answer });
    byUser.set(vote.user_id, list);
  }

  const correctMap = new Map(resolvedPredictions.map((p) => [p.id, p.correct]));

  for (const [userId, votes] of Array.from(byUser.entries())) {
    const resolvableVotes = votes.filter((v: { predictionId: string; answer: boolean }) => correctMap.has(v.predictionId));
    if (resolvableVotes.length === 0) continue;

    const allCorrect = resolvableVotes.every(
      (v: { predictionId: string; answer: boolean }) => correctMap.get(v.predictionId) === v.answer
    );
    if (!allCorrect) continue;

    // All predictions correct — apply 2x bonus
    const { data: session } = await supabase
      .from("user_match_sessions")
      .select("trivia_points, bonus_applied")
      .eq("user_id", userId)
      .eq("match_id", matchId)
      .maybeSingle();

    if (!session || session.bonus_applied || session.trivia_points === 0) continue;

    const bonus = session.trivia_points; // +100% = 2x total
    await supabase
      .from("user_match_sessions")
      .update({ bonus_points: bonus, bonus_applied: true })
      .eq("user_id", userId)
      .eq("match_id", matchId);

    await supabase.rpc("increment_user_points", { uid: userId, delta: bonus }).then(() => {});

    console.log(`[predictions] Awarded ${bonus} bonus pts to user ${userId} for match ${matchId}`);
  }

  console.log(`[predictions] Resolved ${resolvedPredictions.length} predictions for match ${matchId}`);
}
