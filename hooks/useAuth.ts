"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Session } from "@supabase/supabase-js";

export type UserTier = "free" | "ad_free" | "pro";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [tier, setTier] = useState<UserTier>("free");

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
      if (session?.user) loadTier(session.user.id);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) loadTier(session.user.id);
      else setTier("free");
    });

    return () => subscription.unsubscribe();
  }, []);

  async function loadTier(userId: string) {
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from("profiles")
        .select("tier")
        .eq("id", userId)
        .single();
      const row = data as { tier?: string } | null;
      if (row?.tier) setTier(row.tier as UserTier);
    } catch {
      // default free
    }
  }

  const signOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  const avatarUrl = session?.user?.user_metadata?.avatar_url ?? session?.user?.user_metadata?.picture ?? null;

  return {
    session,
    user: session?.user ?? null,
    userId: session?.user?.id ?? null,
    avatarUrl: avatarUrl as string | null,
    isLoggedIn: !!session?.user,
    loading,
    tier,
    signOut,
  };
}
