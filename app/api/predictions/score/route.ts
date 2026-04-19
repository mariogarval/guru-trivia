import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { Database } from "@/lib/supabase/database.types";

/**
 * POST /api/predictions/score
 * Body: { points: number }
 *
 * Adds points to the authenticated user's total_points in profiles.
 * Called when a live prediction resolves correctly.
 */
export async function POST(request: NextRequest) {
  const supabase = createRouteHandlerClient<Database>({ cookies });
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let points: number;
  try {
    const body = await request.json();
    points = Number(body.points);
    if (!Number.isFinite(points) || points <= 0 || points > 10_000) {
      return NextResponse.json({ error: "Invalid points" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  // Increment total_points atomically via RPC or direct update
  const { data: profile } = await supabase
    .from("profiles")
    .select("total_points")
    .eq("id", session.user.id)
    .single();

  const current = (profile as any)?.total_points ?? 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("profiles")
    .update({ total_points: current + points })
    .eq("id", session.user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, newTotal: current + points });
}
