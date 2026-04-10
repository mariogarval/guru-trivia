import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { Database } from "@/lib/supabase/database.types";

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return (
    "GURU-" +
    Array.from({ length: 4 }, () =>
      chars[Math.floor(Math.random() * chars.length)]
    ).join("")
  );
}

// POST /api/leagues — create a new league
export async function POST(request: NextRequest) {
  const supabase = createRouteHandlerClient<Database>({ cookies });
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { name } = await request.json();
  if (!name || typeof name !== "string" || name.length > 50) {
    return NextResponse.json({ error: "Invalid name" }, { status: 400 });
  }

  // Try a few times in case of code collision
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    const { data, error } = await supabase
      .from("leagues")
      .insert({
        name: name.trim(),
        code,
        created_by: session.user.id,
      } as any)
      .select()
      .single();

    if (data) {
      // Auto-join the creator
      await supabase.from("league_members").insert({
        league_id: (data as any).id,
        user_id: session.user.id,
      } as any);
      return NextResponse.json({ league: data });
    }

    if (error && !error.message.includes("unique")) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Failed to generate code" }, { status: 500 });
}

// GET /api/leagues — list user's leagues or look up by code
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  const supabase = createRouteHandlerClient<Database>({ cookies });

  // Look up by code
  if (code) {
    const { data: league } = await supabase
      .from("leagues")
      .select("*")
      .eq("code", code.toUpperCase())
      .single();

    if (!league) {
      return NextResponse.json({ error: "League not found" }, { status: 404 });
    }
    return NextResponse.json({ league });
  }

  // List user's leagues
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ leagues: [] });
  }

  const { data: memberships } = await supabase
    .from("league_members")
    .select("league_id, leagues(id, name, code, created_by, created_at)")
    .eq("user_id", session.user.id);

  const leagues = (memberships as any[] ?? [])
    .map((m: any) => m.leagues)
    .filter(Boolean);

  return NextResponse.json({ leagues });
}

// PATCH /api/leagues — join a league by code
export async function PATCH(request: NextRequest) {
  const supabase = createRouteHandlerClient<Database>({ cookies });
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { code } = await request.json();
  const { data: league } = await supabase
    .from("leagues")
    .select("id")
    .eq("code", code.toUpperCase())
    .single();

  if (!league) {
    return NextResponse.json({ error: "League not found" }, { status: 404 });
  }

  const { error } = await supabase.from("league_members").insert({
    league_id: (league as any).id,
    user_id: session.user.id,
  } as any);

  if (error && error.message.includes("unique")) {
    return NextResponse.json({ message: "Already a member" });
  }
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, leagueId: (league as any).id });
}
