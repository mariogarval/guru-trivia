/**
 * POST /api/matches/sync
 * Called by Vercel cron job daily + can be called manually.
 * Fetches today's matches from FotMob for top European leagues.
 */
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { Database } from "@/lib/supabase/database.types";
import { fetchTodayMatches, fetchUpcomingMatches } from "@/lib/matches";

export async function POST(request: NextRequest) {
  // Validate cron secret (optional for manual triggers)
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && cronSecret !== "your-random-32-char-secret" && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    let matches = await fetchTodayMatches();

    // If no matches today, look ahead up to 3 days
    if (matches.length === 0) {
      matches = await fetchUpcomingMatches();
    }

    if (matches.length === 0) {
      return NextResponse.json({ synced: 0, message: "No matches found" });
    }

    const supabase = createRouteHandlerClient<Database>({ cookies });

    const { error } = await supabase
      .from("matches")
      .upsert(matches as any, { onConflict: "id" });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      synced: matches.length,
      live: matches.filter((m) => m.status === "live").length,
      scheduled: matches.filter((m) => m.status === "scheduled").length,
      finished: matches.filter((m) => m.status === "finished").length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 }
    );
  }
}

// Also allow GET for easy manual triggering
export async function GET(request: NextRequest) {
  return POST(request);
}
