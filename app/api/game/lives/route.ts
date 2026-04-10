import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { Database } from "@/lib/supabase/database.types";
import { calculateLivesRegen, getLivesStatus } from "@/lib/lives";
import type { Profile } from "@/types";

export async function GET() {
  const supabase = createRouteHandlerClient<Database>({ cookies });
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", session.user.id)
    .single();

  if (!profileRow) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const profile = calculateLivesRegen(profileRow as unknown as Profile);

  // Persist regen if lives changed
  if (profile.lives !== (profileRow as unknown as Profile).lives) {
    await (supabase
      .from("profiles") as any)
      .update({
        lives: profile.lives,
        last_life_regen: profile.last_life_regen,
      })
      .eq("id", session.user.id);
  }

  const status = getLivesStatus(profile);
  return NextResponse.json(status);
}
