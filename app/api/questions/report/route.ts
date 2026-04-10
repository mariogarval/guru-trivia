import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { Database } from "@/lib/supabase/database.types";

/**
 * POST /api/questions/report
 * Allows users to report incorrect questions.
 */
export async function POST(request: NextRequest) {
  const supabase = createRouteHandlerClient<Database>({ cookies });
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const body = await request.json();
  const { questionId, reason } = body;

  if (!questionId) {
    return NextResponse.json({ error: "Missing questionId" }, { status: 400 });
  }

  const { error } = await (supabase as any)
    .from("question_reports")
    .insert({
      question_id: questionId,
      user_id: session?.user?.id ?? null,
      reason: reason ?? "incorrect_answer",
    });

  if (error) {
    console.error("Report insert error:", error);
    return NextResponse.json({ error: "Failed to submit report" }, { status: 500 });
  }

  // If a question gets 3+ reports, auto-disable it by marking unverified
  const { count } = await (supabase as any)
    .from("question_reports")
    .select("*", { count: "exact", head: true })
    .eq("question_id", questionId);

  if (count && count >= 3) {
    await (supabase as any)
      .from("questions")
      .update({ verified: false })
      .eq("id", questionId);
  }

  return NextResponse.json({ success: true });
}
