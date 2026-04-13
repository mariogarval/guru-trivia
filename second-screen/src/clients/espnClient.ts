import axios, { AxiosInstance } from "axios";
import { config } from "../config";
import { logger } from "../utils/logger";

// Raw ESPN shapes — intentionally permissive so the normalizer handles gaps
export type EspnStatEntry = {
  name: string;
  displayValue: string;
  value?: number;
};

export type EspnCompetitor = {
  id?: string;
  homeAway?: string;
  team?: {
    id?: string;
    name?: string;
    abbreviation?: string;
    displayName?: string;
  };
  score?: string | number;
  statistics?: EspnStatEntry[];
};

export type EspnPlay = {
  id?: string | number;
  type?: { id?: string | number; text?: string };
  team?: { id?: string; displayName?: string; abbreviation?: string };
  period?: { number?: number };
  clock?: { value?: number; displayValue?: string };
  participants?: Array<{ athlete?: { displayName?: string } }>;
  text?: string;
  wallclock?: string;
};

export type EspnRawMatchData = {
  header?: {
    id?: string;
    competitions?: Array<{
      id?: string;
      competitors?: EspnCompetitor[];
      status?: {
        type?: { name?: string; shortDetail?: string; completed?: boolean };
        displayClock?: string;
        period?: number;
        clock?: number;
      };
    }>;
    league?: { name?: string };
  };
  boxscore?: {
    teams?: Array<{
      team?: { id?: string };
      homeAway?: string;
      statistics?: EspnStatEntry[];
    }>;
  };
  // ESPN uses "plays" in the summary endpoint
  plays?: EspnPlay[];
};

export class EspnClient {
  private http: AxiosInstance;

  constructor() {
    this.http = axios.create({
      baseURL: config.espnBaseUrl,
      timeout: 10_000,
      headers: config.espnApiKey
        ? { Authorization: `Bearer ${config.espnApiKey}` }
        : {},
    });
  }

  async fetchMatch(matchId: string): Promise<EspnRawMatchData | null> {
    try {
      const { data } = await this.http.get<EspnRawMatchData>(
        `/${config.espnLeague}/summary`,
        { params: { event: matchId } }
      );
      return data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        logger.error(
          `ESPN fetch failed: ${error.message} (status: ${error.response?.status ?? "no response"})`
        );
      } else {
        logger.error(`ESPN fetch unexpected error: ${error}`);
      }
      return null;
    }
  }
}

export const espnClient = new EspnClient();
