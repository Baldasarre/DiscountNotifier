const logger = require('../utils/logger');

// 404 Handler
const notFoundHandler = (req, res, next) => {
  // Ignore common browser/dev tool requests
  const ignoredPaths = [
    '/.well-known/',
    '/favicon.ico',
    '/.env',
    '/robots.txt'
  ];

  const shouldIgnore = ignoredPaths.some(path => req.originalUrl.startsWith(path));

  if (shouldIgnore) {
    return res.status(404).end();
  }

  const error = new Error(`Not Found - ${req.originalUrl}`);
  res.status(404);
  next(error);
};

// Global Error Handler
const errorHandler = (err, req, res, next) => {
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;

  logger.error('Application error occurred', {
    message: err.message,
    stack: err.stack,
    statusCode,
    path: req.path,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('user-agent')
  });

  res.status(statusCode).json({
    success: false,
    message: err.message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

// Unhandled Promise Rejection
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection', {
    reason,
    promise
  });
  // Production'da process.exit(1) eklenebilir
});

// Uncaught Exception
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', {
    message: error.message,
    stack: error.stack
  });
  process.exit(1); // Kritik hata, process restart gerekli
});

module.exports = { notFoundHandler, errorHandler };
