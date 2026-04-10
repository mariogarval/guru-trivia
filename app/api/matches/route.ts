import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { Database } from "@/lib/supabase/database.types";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const filter = searchParams.get("filter") ?? "all"; // live | upcoming | past | all

  const supabase = createRouteHandlerClient<Database>({ cookies });
  const now = new Date().toISOString();

  let query = supabase.from("matches").select("*").order("kickoff_time");

  switch (filter) {
    case "live":
      query = query.eq("status", "live");
      break;
    case "upcoming": {
      const in24h = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      query = query
        .eq("status", "scheduled")
        .gte("kickoff_time", now)
        .lte("kickoff_time", in24h);
      break;
    }
    case "past": {
      const minus48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      query = query
        .eq("status", "finished")
        .gte("kickoff_time", minus48h);
      break;
    }
  }

  const { data: matches, error } = await query.limit(20);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ matches: matches ?? [] });
}
