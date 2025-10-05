const monitoringService = require("../services/monitoring.service");

/**
 * Middleware to track API request metrics
 */
const trackRequest = (req, res, next) => {
  const startTime = Date.now();

  // Track response
  res.on("finish", () => {
    const responseTime = Date.now() - startTime;

    // Get user ID from session or request
    const userId = req.user?.id || req.session?.userId || null;

    monitoringService.recordRequest(responseTime, userId);

    // Track errors (4xx and 5xx)
    if (res.statusCode >= 400) {
      monitoringService.recordError();
    }
  });

  next();
};

module.exports = trackRequest;
