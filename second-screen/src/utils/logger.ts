import { config } from "../config";

const ts = () => new Date().toISOString();

export const logger = {
  info: (msg: string) => console.log(`[INFO]  ${ts()} ${msg}`),
  warn: (msg: string) => console.warn(`[WARN]  ${ts()} ${msg}`),
  error: (msg: string) => console.error(`[ERROR] ${ts()} ${msg}`),
  debug: (msg: string) => {
    if (config.nodeEnv !== "production") {
      console.log(`[DEBUG] ${ts()} ${msg}`);
    }
  },
};
