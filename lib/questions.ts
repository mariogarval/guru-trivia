import Anthropic from "@anthropic-ai/sdk";
import type { Difficulty, Category, Language, Question } from "@/types";

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

  const langName = languageInstructions[language];
  const easyCount = Math.round(count * 0.4);
  const mediumCount = Math.round(count * 0.4);
  const hardCount = count - easyCount - mediumCount;

  const prompt = `Generate ${count} unique World Cup trivia questions about ${homeTeam} vs ${awayTeam}.

Requirements:
- Language: ${langName}
- Mix of difficulty: ${easyCount} easy, ${mediumCount} medium, ${hardCount} hard
- Categories: historical facts, player records, tournament stats, team achievements
- Multiple choice format with exactly 4 options (one correct)
- Include brief explanation for correct answer (1-2 sentences)
- Questions should be engaging, accurate, and varied
- Avoid overly obscure facts for easy/medium difficulty
- Cover both teams equally

Return ONLY a valid JSON array (no markdown, no extra text):
[{
  "difficulty": "easy|medium|hard",
  "category": "historical|player|team|tournament",
  "question": "Question text?",
  "options": ["Option A", "Option B", "Option C", "Option D"],
  "correctIndex": 0,
  "explanation": "Brief explanation of correct answer"
}]`;

  const stream = await getClient().messages.stream({
    model: "claude-opus-4-6",
    max_tokens: 64000,
    thinking: { type: "enabled", budget_tokens: 10000 },
    messages: [{ role: "user", content: prompt }],
  });

  const response = await stream.finalMessage();

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text content in response");
  }

  const jsonStr = textBlock.text.trim();
  const parsed = JSON.parse(jsonStr) as GeneratedQuestion[];
  return parsed;
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
    model: "claude-opus-4-6",
    max_tokens: 64000,
    thinking: { type: "enabled", budget_tokens: 10000 },
    messages: [{ role: "user", content: prompt }],
  });

  const response = await stream.finalMessage();
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text content in response");
  }

  return JSON.parse(textBlock.text.trim()) as GeneratedQuestion[];
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
    model: "claude-opus-4-6",
    max_tokens: 64000,
    thinking: { type: "enabled", budget_tokens: 10000 },
    messages: [{ role: "user", content: prompt }],
  });

  const response = await stream.finalMessage();
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text content in response");
  }

  return JSON.parse(textBlock.text.trim()) as GeneratedQuestion[];
}

/**
 * Fetch questions from Supabase for a user, excluding already-answered ones.
 * Falls back to random selection from available questions.
 */
export async function fetchQuestionsForGame(
  supabase: ReturnType<typeof import("@/lib/supabase/client").createClient>,
  userId: string | null,
  matchId: string | null,
  count = 10,
  category: string | null = null
): Promise<Question[]> {
  let query = supabase
    .from("questions")
    .select("*")
    .order("created_at", { ascending: false });

  if (matchId) {
    query = query.or(`match_id.eq.${matchId},match_id.is.null`);
  }

  if (category) {
    query = query.eq("category", category);
  }

  const { data: allQuestions } = await query.limit(500);
  if (!allQuestions || allQuestions.length === 0) return [];

  // Filter out previously answered questions for logged-in users
  if (userId) {
    const { data: answered } = await supabase
      .from("user_answers")
      .select("question_id")
      .eq("user_id", userId);

    const answeredIds = new Set((answered as any[] ?? []).map((a: any) => a.question_id));
    const unanswered = (allQuestions as any[]).filter(
      (q: any) => !answeredIds.has(q.id)
    );

    const pool = unanswered.length >= count ? unanswered : allQuestions;
    return pickRandomN(pool, count).map(dbRowToQuestion);
  }

  return pickRandomN(allQuestions, count).map(dbRowToQuestion);
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
