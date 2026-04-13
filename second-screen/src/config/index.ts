import dotenv from "dotenv";
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || "3001", 10),
  espnBaseUrl:
    process.env.ESPN_API_BASE_URL ||
    "https://site.api.espn.com/apis/site/v2/sports/soccer",
  espnApiKey: process.env.ESPN_API_KEY,
  espnMatchId: process.env.ESPN_MATCH_ID || "",
  espnLeague: process.env.ESPN_LEAGUE || "esp.1",
  useMocks: process.env.USE_MOCKS === "true",
  pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || "15000", 10),
  nodeEnv: process.env.NODE_ENV || "development",
};
