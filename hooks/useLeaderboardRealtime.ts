"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Subscribe to profile changes via Supabase Realtime.
 * Calls `onUpdate` whenever any profile row changes — used to trigger
 * leaderboard refreshes.
 */
export function useLeaderboardRealtime(onUpdate: () => void) {
  const cbRef = useRef(onUpdate);
  cbRef.current = onUpdate;

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel("leaderboard_changes")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles" },
        () => {
          cbRef.current();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
}
