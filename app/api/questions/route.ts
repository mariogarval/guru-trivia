import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { Database } from "@/lib/supabase/database.types";
import { fetchQuestionsForGame } from "@/lib/questions";
import { createClient } from "@/lib/supabase/client";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const matchId = searchParams.get("match_id");
  const count = Math.min(parseInt(searchParams.get("count") ?? "10"), 10);
  const category = searchParams.get("category");

  const supabase = createRouteHandlerClient<Database>({ cookies });
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const userId = session?.user?.id ?? null;

  // Use a server-side client directly for question fetching
  const serverSupabase = supabase as ReturnType<typeof createClient>;
  const questions = await fetchQuestionsForGame(
    serverSupabase,
    userId,
    matchId,
    count,
    category
  );

  // Sanitize: never expose correct_answer_index to client until answered
  const sanitized = questions.map(({ correct_answer_index: _, ...q }) => ({
    ...q,
    correct_answer_index: -1, // hidden — validated server-side on submit
  }));

  return NextResponse.json({ questions: sanitized });
}
