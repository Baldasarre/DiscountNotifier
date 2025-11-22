const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');


const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};


const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue',
};

winston.addColors(colors);

const customFormat = winston.format.printf(({ level, message, timestamp, service, ...metadata }) => {

  const emojiMap = {
    error: '❌',
    warn: '⚠️',
    info: '✅',
    debug: '🔍',
    http: '🌐'
  };

  const emoji = emojiMap[level] || '📝';
  const serviceTag = service ? `[${service.toUpperCase()}]` : '';


  const metaString = Object.keys(metadata).length ? JSON.stringify(metadata, null, 2) : '';

  return `${timestamp} ${emoji} ${level.toUpperCase()} ${serviceTag} ${message} ${metaString}`;
});


const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  customFormat
);


const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);


const transports = [
  // Error logs - günlük rotasyon
  new DailyRotateFile({
    filename: path.join('logs', 'error-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    level: 'error',
    maxSize: '20m',
    maxFiles: '14d',
    format: fileFormat
  }),


  new DailyRotateFile({
    filename: path.join('logs', 'app-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxSize: '20m',
    maxFiles: '7d',
    format: fileFormat
  }),


  new DailyRotateFile({
    filename: path.join('logs', 'scraping-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    level: 'info',
    maxSize: '50m',
    maxFiles: '30d',
    format: fileFormat
  }),


  new DailyRotateFile({
    filename: path.join('logs', 'http-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    level: 'http',
    maxSize: '10m',
    maxFiles: '3d',
    format: fileFormat
  })
];


if (process.env.NODE_ENV !== 'production') {
  transports.push(
    new winston.transports.Console({
      format: consoleFormat,
      level: 'debug'
    })
  );
}


const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels,
  transports,

  exceptionHandlers: [
    new winston.transports.File({ filename: path.join('logs', 'exceptions.log') })
  ],
  rejectionHandlers: [
    new winston.transports.File({ filename: path.join('logs', 'rejections.log') })
  ]
});


const createServiceLogger = (serviceName) => {
  return {
    error: (message, meta = {}) => logger.error(message, { service: serviceName, ...meta }),
    warn: (message, meta = {}) => logger.warn(message, { service: serviceName, ...meta }),
    info: (message, meta = {}) => logger.info(message, { service: serviceName, ...meta }),
    debug: (message, meta = {}) => logger.debug(message, { service: serviceName, ...meta }),
    http: (message, meta = {}) => logger.http(message, { service: serviceName, ...meta })
  };
};


logger.stream = {
  write: (message) => {
    logger.http(message.trim());
  }
};

module.exports = logger;
module.exports.createServiceLogger = createServiceLogger;
