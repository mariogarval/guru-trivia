import type { Profile } from "@/types";
import { MAX_LIVES, LIFE_REGEN_HOURS } from "@/types";

export interface LivesStatus {
  lives: number;
  nextLifeInMs: number | null; // null when at max lives
  nextLifeAt: Date | null;
}

export function calculateLivesRegen(profile: Profile): Profile {
  const now = new Date();
  const lastRegen = new Date(profile.last_life_regen);
  const hoursSince =
    (now.getTime() - lastRegen.getTime()) / (1000 * 60 * 60);

  const livesToAdd = Math.floor(hoursSince / LIFE_REGEN_HOURS);
  const newLives = Math.min(profile.lives + livesToAdd, MAX_LIVES);

  if (livesToAdd > 0) {
    const newLastRegen = new Date(
      lastRegen.getTime() +
        livesToAdd * LIFE_REGEN_HOURS * 60 * 60 * 1000
    );
    return {
      ...profile,
      lives: newLives,
      last_life_regen: newLastRegen.toISOString(),
    };
  }

  return profile;
}

export function getLivesStatus(profile: Profile): LivesStatus {
  const updated = calculateLivesRegen(profile);

  if (updated.lives >= MAX_LIVES) {
    return { lives: updated.lives, nextLifeInMs: null, nextLifeAt: null };
  }

  const lastRegen = new Date(updated.last_life_regen);
  const nextLifeAt = new Date(
    lastRegen.getTime() + LIFE_REGEN_HOURS * 60 * 60 * 1000
  );
  const nextLifeInMs = Math.max(0, nextLifeAt.getTime() - Date.now());

  return { lives: updated.lives, nextLifeInMs, nextLifeAt };
}

export function formatTimeUntilLife(ms: number): string {
  if (ms <= 0) return "Ready!";
  const totalSeconds = Math.ceil(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}
