export {
  buildFallbackIdeas,
  COACH_ALERT_CACHE_TTL_MS,
  COACH_ALERT_LOOKBACK_DAYS,
  coachInsightAlertCache,
  extractTopicTokens,
  extractYouTubeError,
  formatDurationLabel,
  getGeminiKeyFromRequest,
  getSessionAccountsAndActiveIndex,
  installYouTubeDataApiCacheFetch,
  isMissingConfigValue,
  mapSupabaseAccountToLegacyUser,
  normalizeYouTubeSearchQueries,
  normalizeYouTubeSearchQuery,
  parseISODurationToSeconds,
  parseMaxResults,
  pickBestTopicInsight,
  setSessionAccountsAndActiveIndex,
  toNumber,
  type CoachVideoSignal,
  type SupabaseProfileRow,
  type SupabaseYouTubeAccountRow,
  type UnifiedAccountState,
} from "../src/server/serverHelpers.js";

export type {
  CoachTopicInsight,
} from "../src/server/serverHelpers.js";
