/**
 * Deterministic fake community data for prediction trends + leaderboard FOMO.
 * Uses a simple hash so the same matchId always returns the same numbers.
 */

function hashStr(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
  }
  return Math.abs(h);
}

export interface CommunityPrediction {
  homeWin: number;        // integer percentage
  draw: number;
  awayWin: number;
  totalPredictors: number;
}

/**
 * Returns stable fake community prediction percentages for a match.
 * Home team carries a slight built-in edge to look realistic.
 */
export function getCommunityPrediction(matchId: string): CommunityPrediction {
  const h = hashStr(matchId);
  const homeWin = 30 + (h % 26);          // 30–55 %
  const draw    = 14 + ((h >> 6) % 16);   // 14–29 %
  const awayWin = 100 - homeWin - draw;
  const totalPredictors = 1200 + ((h >> 3) % 6800); // 1.2 k – 8 k
  return { homeWin, draw, awayWin, totalPredictors };
}

export interface FakeLeaderboardUser {
  user_id: string;
  username: string;
  country: string;
  total_points: number;
  global_rank: number;
}

export const FAKE_LEADERBOARD_USERS: FakeLeaderboardUser[] = [
  { user_id: "f1",  username: "CristianRM10",   country: "Spain",       total_points: 52_840, global_rank: 1  },
  { user_id: "f2",  username: "futbolking99",    country: "Argentina",   total_points: 49_120, global_rank: 2  },
  { user_id: "f3",  username: "PremierProphet",  country: "England",     total_points: 47_600, global_rank: 3  },
  { user_id: "f4",  username: "ElClasico_Fan",   country: "Spain",       total_points: 45_300, global_rank: 4  },
  { user_id: "f5",  username: "ChampionsGuru",   country: "France",      total_points: 43_750, global_rank: 5  },
  { user_id: "f6",  username: "GoalMachine_7",   country: "Portugal",    total_points: 41_200, global_rank: 6  },
  { user_id: "f7",  username: "TacticsTitan",    country: "Germany",     total_points: 39_800, global_rank: 7  },
  { user_id: "f8",  username: "LigaLeyenda",     country: "Spain",       total_points: 37_450, global_rank: 8  },
  { user_id: "f9",  username: "xGWizard",        country: "Netherlands", total_points: 35_100, global_rank: 9  },
  { user_id: "f10", username: "PressingPanda",   country: "Japan",       total_points: 33_600, global_rank: 10 },
  { user_id: "f11", username: "OffsideTrap",     country: "Belgium",     total_points: 31_200, global_rank: 11 },
  { user_id: "f12", username: "NinetyPlusGuru",  country: "Brazil",      total_points: 29_800, global_rank: 12 },
  { user_id: "f13", username: "DerbyDay_Dan",    country: "England",     total_points: 27_500, global_rank: 13 },
  { user_id: "f14", username: "SerieAScholar",   country: "Italy",       total_points: 25_300, global_rank: 14 },
  { user_id: "f15", username: "BundesligaBrain", country: "Germany",     total_points: 23_100, global_rank: 15 },
  { user_id: "f16", username: "LaPulgaFan",      country: "Argentina",   total_points: 20_900, global_rank: 16 },
  { user_id: "f17", username: "CornerKingXI",    country: "Mexico",      total_points: 18_700, global_rank: 17 },
  { user_id: "f18", username: "HighPressHero",   country: "France",      total_points: 16_500, global_rank: 18 },
  { user_id: "f19", username: "SetPiece_Sage",   country: "Uruguay",     total_points: 14_300, global_rank: 19 },
  { user_id: "f20", username: "FootballOracle",  country: "Morocco",     total_points: 12_100, global_rank: 20 },
];
