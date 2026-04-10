/**
 * POST /api/matches/sync
 * Called by a Vercel cron job every minute to sync live match data.
 * Protected by CRON_SECRET environment variable.
 */
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { Database } from "@/lib/supabase/database.types";
import { fetchWorldCupMatches } from "@/lib/matches";

export async function POST(request: NextRequest) {
  // Validate cron secret
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const matches = await fetchWorldCupMatches();

    // Upsert uses service role via the admin client
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
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 }
    );
  }
}
