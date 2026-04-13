import app from "./app";
import { config } from "./config";
import { logger } from "./utils/logger";

app.listen(config.port, () => {
  logger.info(`Second Screen server listening on port ${config.port}`);
  logger.info(`Mode: ${config.useMocks ? "MOCK (simulation)" : "LIVE (ESPN)"}`);
  if (!config.useMocks && config.espnMatchId) {
    logger.info(`ESPN match ID: ${config.espnMatchId}`);
    logger.info(`ESPN league:   ${config.espnLeague}`);
  }
  if (!config.useMocks && !config.espnMatchId) {
    logger.warn("ESPN_MATCH_ID is not set. Set it in .env or use USE_MOCKS=true");
  }
});
