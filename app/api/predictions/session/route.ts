/**
 * POST /api/predictions/session
 * Records the trivia score a user earned during a live match session.
 * Used by the resolve cron to award the 2x bonus if predictions were correct.
 */

import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { Database } from "@/lib/supabase/database.types";

export async function POST(request: NextRequest) {
  const supabase = createRouteHandlerClient<Database>({ cookies });
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return NextResponse.json({ ok: false }, { status: 401 });

  const { matchId, triviaPoints } = await request.json() as {
    matchId: string;
    triviaPoints: number;
  };
  if (!matchId || typeof triviaPoints !== "number") {
    return NextResponse.json({ error: "matchId and triviaPoints required" }, { status: 400 });
  }

  const { createClient: createSbClient } = await import("@supabase/supabase-js");
  const service = createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  await service
    .from("user_match_sessions")
    .upsert(
      { user_id: session.user.id, match_id: matchId, trivia_points: triviaPoints },
      { onConflict: "user_id,match_id" }
    );

  return NextResponse.json({ ok: true });
}
