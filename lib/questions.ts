import Anthropic from "@anthropic-ai/sdk";
import type { Difficulty, Category, Language, Question } from "@/types";
import type { LiveMatchContext, PreGameContext } from "@/lib/sports-data";

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

export interface GeneratedQuestion {
  difficulty: Difficulty;
  category: Category;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export async function generateQuestionsForMatch(
  homeTeam: string,
  awayTeam: string,
  count = 10,
  language: Language = "en"
): Promise<GeneratedQuestion[]> {
  const languageInstructions: Record<Language, string> = {
    en: "English",
    es: "Spanish",
    fr: "French",
    de: "German",
    pt: "Portuguese",
  };

  const langName = languageInstructions[language];
  const easyCount = Math.round(count * 0.4);
  const mediumCount = Math.round(count * 0.4);
  const hardCount = count - easyCount - mediumCount;

  const prompt = `Generate ${count} unique football/soccer trivia questions specifically about ${homeTeam} and ${awayTeam}.

Requirements:
- Language: ${langName}
- Mix of difficulty: ${easyCount} easy, ${mediumCount} medium, ${hardCount} hard
- Topics to cover (mix of these):
  * Head-to-head history between ${homeTeam} and ${awayTeam}
  * Famous players (past and current) from both clubs
  * Stadium and venue facts for both teams
  * Recent season performance, transfers, and managers
  * Historical achievements, records, and trophies
  * Iconic moments between these teams
  * League-specific questions relevant to both teams
- Multiple choice format with exactly 4 options (one correct)
- Include brief explanation for correct answer (1-2 sentences)
- Questions must be factually accurate and up to date (as of 2025-2026 season)
- Cover both teams roughly equally

Return ONLY a valid JSON array (no markdown, no extra text):
[{
  "difficulty": "easy|medium|hard",
  "category": "player|team|historical|tournament",
  "question": "Question text?",
  "options": ["Option A", "Option B", "Option C", "Option D"],
  "correctIndex": 0,
  "explanation": "Brief explanation of correct answer"
}]`;

  const stream = await getClient().messages.stream({
    model: "claude-sonnet-4-20250514",
    max_tokens: 16000,
    messages: [{ role: "user", content: prompt }],
  });

  const response = await stream.finalMessage();

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text content in response");
  }

  const jsonStr = textBlock.text.trim();
  // Handle potential markdown code blocks
  const cleaned = jsonStr.replace(/^```json?\n?/i, "").replace(/\n?```$/i, "");
  const parsed = JSON.parse(cleaned) as GeneratedQuestion[];
  return parsed;
}

/**
 * Generate pre-game trivia grounded in real league data.
 *
 * When `context` is provided, the prompt includes verified standings and top
 * scorer data so Claude can only write questions it can answer accurately.
 * Questions about current-season stats use the API data; historical questions
 * are explicitly constrained to well-known facts Claude is confident about.
 */
export async function generatePreGameQuestions(
  homeTeam: string,
  awayTeam: string,
  context: PreGameContext | null,
  count = 10,
  language: Language = "en"
): Promise<GeneratedQuestion[]> {
  const languageInstructions: Record<Language, string> = {
    en: "English", es: "Spanish", fr: "French", de: "German", pt: "Portuguese",
  };
  const langName = languageInstructions[language];
  const easyCount = Math.round(count * 0.4);
  const mediumCount = Math.round(count * 0.4);
  const hardCount = count - easyCount - mediumCount;

  // Build a verified-data block to inject into the prompt
  let verifiedDataBlock = "";
  if (context) {
    const lines: string[] = [`VERIFIED REAL DATA FOR ${context.leagueName.toUpperCase()}:`];

    if (context.homeStanding) {
      const s = context.homeStanding;
      lines.push(
        `${homeTeam} — Position: ${s.position}, Points: ${s.points}, ` +
        `Record: ${s.won}W-${s.drawn}D-${s.lost}L, ` +
        `Goals: ${s.goalsFor} scored / ${s.goalsAgainst} conceded` +
        (s.form ? `, Recent form: ${s.form}` : "")
      );
    }
    if (context.awayStanding) {
      const s = context.awayStanding;
      lines.push(
        `${awayTeam} — Position: ${s.position}, Points: ${s.points}, ` +
        `Record: ${s.won}W-${s.drawn}D-${s.lost}L, ` +
        `Goals: ${s.goalsFor} scored / ${s.goalsAgainst} conceded` +
        (s.form ? `, Recent form: ${s.form}` : "")
      );
    }

    if (context.standings && context.standings.length > 0) {
      lines.push("\nFULL LEAGUE TABLE (top 10):");
      context.standings.slice(0, 10).forEach((s) => {
        lines.push(
          `${s.position}. ${s.team} — ${s.points} pts (${s.won}W ${s.drawn}D ${s.lost}L, GF:${s.goalsFor} GA:${s.goalsAgainst})`
        );
      });
    }

    if (context.topScorers && context.topScorers.length > 0) {
      lines.push("\nTOP SCORERS THIS SEASON:");
      context.topScorers.slice(0, 10).forEach((sc, i) => {
        lines.push(
          `${i + 1}. ${sc.player} (${sc.team}) — ${sc.goals} goals` +
          (sc.assists !== null ? `, ${sc.assists} assists` : "")
        );
      });
    }

    verifiedDataBlock = lines.join("\n");
  }

  const prompt = `You are generating pre-match football trivia for ${homeTeam} vs ${awayTeam}.
Language: ${langName}
Difficulty mix: ${easyCount} easy, ${mediumCount} medium, ${hardCount} hard

${verifiedDataBlock ? verifiedDataBlock + "\n\n" : ""}INSTRUCTIONS:
${verifiedDataBlock
  ? `- You MUST write at least ${Math.ceil(count * 0.5)} questions directly based on the verified data above (standings, scorers, form, goals scored/conceded). These are factually guaranteed to be correct.
- For remaining questions, cover historical facts about ${homeTeam} and ${awayTeam} (famous players, trophies, stadiums, rivalries) — but ONLY include facts you are highly confident are correct. If uncertain, skip the topic.`
  : `- Cover facts about ${homeTeam} and ${awayTeam}: famous players, trophies, stadiums, head-to-head history, rivalries.
- IMPORTANT: Only include questions where you are highly confident the answer is correct. Do not guess or approximate statistics.`}
- Multiple choice, exactly 4 options (one correct)
- Brief explanation for the correct answer (1–2 sentences)
- Distribute questions roughly equally between both teams

Return ONLY a valid JSON array (no markdown):
[{
  "difficulty": "easy|medium|hard",
  "category": "player|team|historical|tournament",
  "question": "Question text?",
  "options": ["A", "B", "C", "D"],
  "correctIndex": 0,
  "explanation": "Why this answer is correct"
}]`;

  const stream = await getClient().messages.stream({
    model: "claude-sonnet-4-20250514",
    max_tokens: 16000,
    messages: [{ role: "user", content: prompt }],
  });
  const response = await stream.finalMessage();
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("No text in response");
  const cleaned = textBlock.text.trim().replace(/^```json?\n?/i, "").replace(/\n?```$/i, "");
  return JSON.parse(cleaned) as GeneratedQuestion[];
}

/**
 * Generate live-match trivia grounded in real match events.
 *
 * Questions are based ONLY on what has actually happened in the match so far:
 * goals scored, scorers, cards, current stats. Claude is explicitly told not to
 * invent events. If no goals have been scored yet, it generates valid questions
 * about match facts (score, teams) and prediction-style questions.
 */
export async function generateLiveMatchQuestions(
  homeTeam: string,
  awayTeam: string,
  context: LiveMatchContext,
  count = 10,
  language: Language = "en"
): Promise<GeneratedQuestion[]> {
  const languageInstructions: Record<Language, string> = {
    en: "English", es: "Spanish", fr: "French", de: "German", pt: "Portuguese",
  };
  const langName = languageInstructions[language];

  // Build match event summary
  const statusLabel =
    context.matchStatus === "live"
      ? `LIVE — ${context.minute || "in progress"}`
      : context.matchStatus === "finished"
      ? "FULL TIME"
      : "UPCOMING";

  const scoreStr = `${context.homeTeam} ${context.homeScore}–${context.awayScore} ${context.awayTeam}`;

  const goalLines =
    context.goals.length > 0
      ? context.goals
          .map(
            (g) =>
              `  ${g.minute} — ${g.player} (${g.team})` +
              (g.isPenalty ? " [Penalty]" : "") +
              (g.isOwnGoal ? " [Own Goal]" : "")
          )
          .join("\n")
      : "  No goals scored yet";

  const yellowLines =
    context.yellowCards.length > 0
      ? context.yellowCards.map((c) => `  ${c.minute} — ${c.player} (${c.team})`).join("\n")
      : "  None";

  const redLines =
    context.redCards.length > 0
      ? context.redCards.map((c) => `  ${c.minute} — ${c.player} (${c.team})`).join("\n")
      : "  None";

  const homeStatsStr = context.homeStats
    ? [
        context.homeStats.possession !== null ? `Possession: ${context.homeStats.possession}%` : null,
        context.homeStats.shots !== null ? `Shots: ${context.homeStats.shots}` : null,
        context.homeStats.shotsOnTarget !== null ? `On target: ${context.homeStats.shotsOnTarget}` : null,
        context.homeStats.corners !== null ? `Corners: ${context.homeStats.corners}` : null,
      ]
        .filter(Boolean)
        .join(", ")
    : null;

  const awayStatsStr = context.awayStats
    ? [
        context.awayStats.possession !== null ? `Possession: ${context.awayStats.possession}%` : null,
        context.awayStats.shots !== null ? `Shots: ${context.awayStats.shots}` : null,
        context.awayStats.shotsOnTarget !== null ? `On target: ${context.awayStats.shotsOnTarget}` : null,
        context.awayStats.corners !== null ? `Corners: ${context.awayStats.corners}` : null,
      ]
        .filter(Boolean)
        .join(", ")
    : null;

  const easyCount = Math.round(count * 0.5);
  const mediumCount = Math.round(count * 0.3);
  const hardCount = count - easyCount - mediumCount;

  const prompt = `You are generating live-match trivia for fans watching this football match RIGHT NOW.
Language: ${langName}
Difficulty mix: ${easyCount} easy, ${mediumCount} medium, ${hardCount} hard

MATCH STATUS: ${statusLabel}
SCORE: ${scoreStr}

GOALS:
${goalLines}

YELLOW CARDS:
${yellowLines}

RED CARDS:
${redLines}

MATCH STATS:
${homeTeam}: ${homeStatsStr ?? "not available"}
${awayTeam}: ${awayStatsStr ?? "not available"}

INSTRUCTIONS:
- Base questions STRICTLY on the verified match data above. Do NOT invent goals, cards, or statistics.
- Prioritise questions about events that have actually happened (who scored, what minute, which team leads, etc.)
- If no goals have occurred yet, ask questions about the current score, possession stats, or prediction-style questions like "If [team] scores next, what would the score be?"
- Avoid questions that require knowledge of events not listed above.
- Multiple choice, exactly 4 options (one correct), brief explanation.
- Mix question styles: factual recall, calculation (e.g. total goals), prediction.

Return ONLY a valid JSON array (no markdown):
[{
  "difficulty": "easy|medium|hard",
  "category": "player|team|historical|tournament",
  "question": "Question text?",
  "options": ["A", "B", "C", "D"],
  "correctIndex": 0,
  "explanation": "Why this answer is correct"
}]`;

  const stream = await getClient().messages.stream({
    model: "claude-sonnet-4-20250514",
    max_tokens: 16000,
    messages: [{ role: "user", content: prompt }],
  });
  const response = await stream.finalMessage();
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("No text in response");
  const cleaned = textBlock.text.trim().replace(/^```json?\n?/i, "").replace(/\n?```$/i, "");
  return JSON.parse(cleaned) as GeneratedQuestion[];
}

export async function generateGeneralQuestions(
  count = 50,
  language: Language = "en"
): Promise<GeneratedQuestion[]> {
  const languageInstructions: Record<Language, string> = {
    en: "English",
    es: "Spanish",
    fr: "French",
    de: "German",
    pt: "Portuguese",
  };

  const prompt = `Generate ${count} unique World Cup 2026 trivia questions covering general soccer/football knowledge.

Requirements:
- Language: ${languageInstructions[language]}
- Mix: 40% easy, 40% medium, 20% hard
- Categories: historical facts, player records, tournament stats, team achievements
- Multiple choice with 4 options (one correct)
- Include brief explanation
- Cover different eras, teams, and players from around the world

Return ONLY a valid JSON array:
[{
  "difficulty": "easy|medium|hard",
  "category": "historical|player|team|tournament",
  "question": "Question text?",
  "options": ["Option A", "Option B", "Option C", "Option D"],
  "correctIndex": 0,
  "explanation": "Brief explanation"
}]`;

  const stream = await getClient().messages.stream({
    model: "claude-sonnet-4-20250514",
    max_tokens: 64000,
    messages: [{ role: "user", content: prompt }],
  });

  const response = await stream.finalMessage();
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text content in response");
  }

  const cleaned = textBlock.text.trim().replace(/^```json?\n?/i, "").replace(/\n?```$/i, "");
  return JSON.parse(cleaned) as GeneratedQuestion[];
}

export async function generateCategoryQuestions(
  category: string,
  count = 50,
  language: Language = "en"
): Promise<GeneratedQuestion[]> {
  const languageInstructions: Record<Language, string> = {
    en: "English",
    es: "Spanish",
    fr: "French",
    de: "German",
    pt: "Portuguese",
  };

  const categoryPrompts: Record<string, string> = {
    world_cup: `Generate ${count} unique FIFA World Cup trivia questions. Cover all World Cup tournaments from 1930 to 2022. Include questions about winners, golden boot winners, host nations, memorable moments, upsets, records, goalscorers, and World Cup 2026 host cities (USA, Mexico, Canada).`,
    champions_league: `Generate ${count} unique UEFA Champions League trivia questions. Cover the history of the European Cup / Champions League. Include questions about winners, top scorers, memorable finals, records, legendary performances, and modern era clubs.`,
    nations: `Generate ${count} unique national football team trivia questions. Cover international football across all confederations (UEFA, CONMEBOL, CONCACAF, CAF, AFC, OFC). Include questions about rivalries, captains, coaching records, confederation tournaments (Copa America, Euro, Africa Cup), and FIFA rankings.`,
    player: `Generate ${count} unique football player trivia questions. Cover legendary and current players across all eras. Include questions about Ballon d'Or winners, transfer records, goal records, career stats, nicknames, and iconic moments.`,
    team: `Generate ${count} unique football club/team trivia questions. Cover major clubs worldwide — Premier League, La Liga, Serie A, Bundesliga, Ligue 1, Liga MX, MLS, and others. Include questions about stadiums, nicknames, founding years, domestic records, and rivalries.`,
    historical: `Generate ${count} unique historical football trivia questions. Cover the entire history of the sport from its origins to modern times. Include questions about rule changes, legendary matches, forgotten records, pioneering figures, and evolution of tactics.`,
  };

  const prompt = `${categoryPrompts[category] ?? `Generate ${count} unique football trivia questions about ${category}.`}

Requirements:
- Language: ${languageInstructions[language]}
- Mix: 40% easy, 40% medium, 20% hard
- Multiple choice with exactly 4 options (one correct)
- Include brief explanation for each answer (1-2 sentences)
- Questions must be factually accurate
- Avoid repeating similar questions

Return ONLY a valid JSON array (no markdown, no extra text):
[{
  "difficulty": "easy|medium|hard",
  "category": "${category}",
  "question": "Question text?",
  "options": ["Option A", "Option B", "Option C", "Option D"],
  "correctIndex": 0,
  "explanation": "Brief explanation"
}]`;

  const stream = await getClient().messages.stream({
    model: "claude-sonnet-4-20250514",
    max_tokens: 64000,
    messages: [{ role: "user", content: prompt }],
  });

  const response = await stream.finalMessage();
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text content in response");
  }

  const cleaned = textBlock.text.trim().replace(/^```json?\n?/i, "").replace(/\n?```$/i, "");
  return JSON.parse(cleaned) as GeneratedQuestion[];
}

/**
 * Build keyword search terms from team names and league.
 * E.g., "Real Madrid" → ["real", "madrid"]
 * "Premier League" → ["premier", "league"]
 */
function buildSearchKeywords(teams?: string, league?: string): string[] {
  const keywords: string[] = [];
  const stopWords = new Set([
    "fc", "cf", "sc", "ac", "as", "us", "ss", "cd", "ud", "sd",
    "the", "de", "del", "di", "von", "van", "le", "la", "los",
    "and", "united", "city", "club", "sporting", "athletic",
  ]);

  if (teams) {
    const teamNames = teams.split(",").map((t) => t.trim());
    for (const name of teamNames) {
      // Add full team name and individual significant words
      keywords.push(name.toLowerCase());
      const words = name.toLowerCase().split(/\s+/);
      for (const word of words) {
        if (word.length > 2 && !stopWords.has(word)) {
          keywords.push(word);
        }
      }
    }
  }

  if (league) {
    keywords.push(league.toLowerCase());
    // Map common league names to their countries/related terms
    const leagueKeywords: Record<string, string[]> = {
      "premier league": ["english", "england", "epl", "premier"],
      "la liga": ["spanish", "spain", "liga"],
      "serie a": ["italian", "italy", "serie"],
      "bundesliga": ["german", "germany", "bundesliga"],
    };
    const extra = leagueKeywords[league.toLowerCase()];
    if (extra) keywords.push(...extra);
  }

  return Array.from(new Set(keywords));
}

/**
 * Score a question by how many keywords it matches.
 * Looks at question text, options, and explanation.
 */
function scoreQuestionRelevance(row: any, keywords: string[]): number {
  if (!keywords.length) return 0;

  const searchText = [
    row.question_text ?? "",
    ...(Array.isArray(row.options) ? row.options : []),
    row.explanation ?? "",
  ]
    .join(" ")
    .toLowerCase();

  let score = 0;
  for (const kw of keywords) {
    if (searchText.includes(kw)) {
      // Full team name match is worth more
      score += kw.includes(" ") ? 3 : 1;
    }
  }
  return score;
}

/**
 * Fetch questions from Supabase for a user, with smart team/league matching.
 *
 * Priority order:
 * 1. Questions matching teams/league keywords (scored by relevance)
 * 2. If not enough, try AI generation (if API key configured)
 * 3. Fall back to general questions from the pool
 */
export async function fetchQuestionsForGame(
  supabase: ReturnType<typeof import("@/lib/supabase/client").createClient>,
  userId: string | null,
  matchId: string | null,
  count = 10,
  category: string | null = null,
  teams?: string,
  league?: string,
  /**
   * Optional generation function override.
   * When provided, replaces the default generateQuestionsForMatch() call.
   * Use this to inject context-aware (live or pre-game) generation.
   */
  generateFn?: (homeTeam: string, awayTeam: string) => Promise<GeneratedQuestion[]>
): Promise<Question[]> {
  const keywords = buildSearchKeywords(teams, league);
  const hasMatchContext = keywords.length > 0;

  // Fetch a large pool of verified questions only
  let query = supabase
    .from("questions")
    .select("*")
    .neq("verified", false)
    .order("created_at", { ascending: false });

  if (matchId) {
    query = query.or(`match_id.eq.${matchId},match_id.is.null`);
  }

  // Don't filter by category when we have match context — we want to search across all categories
  if (category && !hasMatchContext) {
    query = query.eq("category", category);
  }

  const { data: allQuestions } = await query.limit(500);
  if (!allQuestions || allQuestions.length === 0) return [];

  // Get previously answered questions for logged-in users
  let answeredIds = new Set<string>();
  if (userId) {
    const { data: answered } = await supabase
      .from("user_answers")
      .select("question_id")
      .eq("user_id", userId);
    answeredIds = new Set((answered as any[] ?? []).map((a: any) => a.question_id));
  }

  const availableQuestions = (allQuestions as any[]).filter(
    (q: any) => !answeredIds.has(q.id) || answeredIds.size === 0
  );

  // If we have match context, score and sort by relevance
  if (hasMatchContext) {
    const scored = availableQuestions.map((q) => ({
      question: q,
      relevance: scoreQuestionRelevance(q, keywords),
    }));

    // Sort by relevance (highest first)
    scored.sort((a, b) => b.relevance - a.relevance);

    // Get questions with any relevance
    const relevant = scored.filter((s) => s.relevance > 0);

    if (relevant.length >= count) {
      // Enough relevant questions — pick top ones with some randomness
      const topPool = relevant.slice(0, Math.min(relevant.length, count * 3));
      const selected = pickRandomN(topPool, count);
      return selected.map((s) => dbRowToQuestion(s.question));
    }

    // Not enough relevant questions in DB — try AI generation
    if (teams && process.env.ANTHROPIC_API_KEY) {
      try {
        const teamNames = teams.split(",").map((t) => t.trim());
        const homeTeam = teamNames[0] ?? "Home Team";
        const awayTeam = teamNames[1] ?? "Away Team";

        console.log(`Generating ${count} match-specific questions for ${homeTeam} vs ${awayTeam}...`);
        const generated = generateFn
          ? await generateFn(homeTeam, awayTeam)
          : await generateQuestionsForMatch(homeTeam, awayTeam, count);

        // Save generated questions to DB for future use
        const rows = generated.map((q) => ({
          match_id: matchId,
          category: q.category as any,
          difficulty: q.difficulty as any,
          question_text: q.question,
          options: q.options,
          correct_answer_index: q.correctIndex,
          explanation: q.explanation,
          language: "en",
        }));

        const { data: inserted } = await (supabase
          .from("questions") as any)
          .insert(rows)
          .select();

        if (inserted && inserted.length > 0) {
          return pickRandomN(inserted, count).map(dbRowToQuestion);
        }

        // If insert failed, return directly
        return generated.slice(0, count).map((q, i) => ({
          id: `gen-${Date.now()}-${i}`,
          match_id: matchId,
          category: q.category,
          difficulty: q.difficulty,
          question_text: q.question,
          options: q.options,
          correct_answer_index: q.correctIndex,
          explanation: q.explanation,
          language: "en",
          created_at: new Date().toISOString(),
        }));
      } catch (err) {
        console.error("AI question generation failed:", err);
        // Fall through to fallback
      }
    }

    // Fallback: mix whatever relevant we found with random general questions
    const relevantQuestions = relevant.map((s) => dbRowToQuestion(s.question));
    const remaining = count - relevantQuestions.length;
    const nonRelevant = scored
      .filter((s) => s.relevance === 0)
      .map((s) => s.question);
    const filler = pickRandomN(nonRelevant, remaining).map(dbRowToQuestion);

    return [...relevantQuestions, ...filler];
  }

  // No match context — standard random selection
  const pool = availableQuestions.length >= count ? availableQuestions : (allQuestions as any[]);
  return pickRandomN(pool, count).map(dbRowToQuestion);
}

function pickRandomN<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dbRowToQuestion(row: any): Question {
  return {
    id: row.id,
    match_id: row.match_id,
    category: row.category,
    difficulty: row.difficulty,
    question_text: row.question_text,
    options: Array.isArray(row.options) ? row.options : JSON.parse(row.options),
    correct_answer_index: row.correct_answer_index,
    explanation: row.explanation,
    language: row.language,
    created_at: row.created_at,
  };
}
