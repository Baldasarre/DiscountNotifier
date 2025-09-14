module.exports = {
  NODE_ENV: process.env.NODE_ENV || "development",
  AUTO_FETCH_ON_STARTUP: process.env.AUTO_FETCH_ON_STARTUP !== "false",
  INITIAL_DATA_FETCH: process.env.INITIAL_DATA_FETCH !== "false",
  ENABLE_PERIODIC_TASKS: process.env.ENABLE_PERIODIC_TASKS === "true",
  FORCE_INITIAL_FETCH: process.env.FORCE_INITIAL_FETCH === "false",
  FORCE_STRADIVARIUS_INITIAL_FETCH:
    process.env.FORCE_STRADIVARIUS_INITIAL_FETCH === "false",
  FORCE_BERSHKA_INITIAL_FETCH:
    process.env.FORCE_BERSHKA_INITIAL_FETCH === "false",
  FORCE_BERSHKA_CATEGORY_FETCH:
    process.env.FORCE_BERSHKA_CATEGORY_FETCH === "false",
  ENABLE_BERSHKA_CURL_FETCH: process.env.ENABLE_BERSHKA_CURL_FETCH === "false",
  LOG_LEVEL: process.env.LOG_LEVEL || "info",
};
