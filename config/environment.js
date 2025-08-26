module.exports = {
  NODE_ENV: process.env.NODE_ENV || "development",
  AUTO_FETCH_ON_STARTUP: process.env.AUTO_FETCH_ON_STARTUP !== "false",
  INITIAL_DATA_FETCH: process.env.INITIAL_DATA_FETCH !== "false",
  ENABLE_PERIODIC_TASKS: process.env.ENABLE_PERIODIC_TASKS === "true",
  FORCE_INITIAL_FETCH: process.env.FORCE_INITIAL_FETCH === "true",
  LOG_LEVEL: process.env.LOG_LEVEL || "info",
};
