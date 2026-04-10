/**
 * Question pre-generation script.
 * Run with: npm run generate-questions
 *
 * Generates questions for World Cup 2026 teams and stores them in Supabase.
 */
import * as fs from "fs";
import * as path from "path";

// Load .env.local manually (dotenv/tsx have issues with this file)
const envPath = path.resolve(process.cwd(), ".env.local");
const envContent = fs.readFileSync(envPath, "utf8");
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx > 0) {
    process.env[trimmed.substring(0, eqIdx)] = trimmed.substring(eqIdx + 1);
  }
}
import { createClient } from "@supabase/supabase-js";
import {
  generateQuestionsForMatch,
  generateGeneralQuestions,
  generateCategoryQuestions,
} from "../lib/questions";
import type { Database } from "../lib/supabase/database.types";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function insertQuestions(
  questions: Awaited<ReturnType<typeof generateGeneralQuestions>>,
  matchId: string | null = null
) {
  const rows = questions.map((q) => ({
    match_id: matchId,
    category: q.category,
    difficulty: q.difficulty,
    question_text: q.question,
    options: q.options,
    correct_answer_index: q.correctIndex,
    explanation: q.explanation,
    language: "en" as const,
  }));

  const { error } = await supabase.from("questions").insert(rows);
  if (error) {
    console.error("Insert error:", error.message);
  } else {
    console.log(`  ✓ Inserted ${rows.length} questions`);
  }
}

async function main() {
  console.log("🌍 GURU Question Generator — World Cup 2026\n");

  // Check what we already have
  const { count } = await supabase
    .from("questions")
    .select("*", { count: "exact", head: true });
  console.log(`📊 Current question count: ${count ?? 0}\n`);

  // Generate category-specific questions
  const categories = [
    "world_cup",
    "champions_league",
    "nations",
    "player",
    "team",
    "historical",
  ];

  for (const category of categories) {
    console.log(`\n📝 Generating 50 "${category}" questions...`);
    try {
      const questions = await generateCategoryQuestions(category, 50);
      await insertQuestions(questions);
    } catch (err) {
      console.error(`  ✗ Failed for ${category}:`, err instanceof Error ? err.message : err);
    }
    // Rate limiting pause
    await new Promise((r) => setTimeout(r, 3000));
  }

  // Generate general mixed questions
  console.log("\n📝 Generating 50 general mixed questions...");
  try {
    const general = await generateGeneralQuestions(50);
    await insertQuestions(general);
  } catch (err) {
    console.error("  ✗ Failed for general:", err instanceof Error ? err.message : err);
  }
  await new Promise((r) => setTimeout(r, 3000));

  // Generate match-specific questions for popular matchups
  const matchups: [string, string][] = [
    ["Brazil", "Argentina"],
    ["France", "England"],
    ["Spain", "Germany"],
    ["USA", "Mexico"],
    ["Portugal", "Netherlands"],
  ];

  for (const [home, away] of matchups) {
    console.log(`\n⚽ Generating 30 questions: ${home} vs ${away}...`);
    try {
      const questions = await generateQuestionsForMatch(home, away, 30);
      await insertQuestions(questions);
    } catch (err) {
      console.error(`  ✗ Failed for ${home} vs ${away}:`, err instanceof Error ? err.message : err);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }

  // Final count
  const { count: finalCount } = await supabase
    .from("questions")
    .select("*", { count: "exact", head: true });
  console.log(`\n✅ Done! Total questions in database: ${finalCount}`);
}

main().catch(console.error);
