import winston from 'winston';
import { format } from 'winston';
import config from '../config';

const { combine, timestamp, printf, colorize, json } = format;

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define colors for different log levels
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

// Add colors to winston
winston.addColors(colors);

// Custom format for console output
const consoleFormat = printf(({ level, message, timestamp, ...meta }) => {
  const metaString = Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 2)}` : '';
  return `[${timestamp}] ${level}: ${message}${metaString}`;
});

// Create a logger instance
const logger = winston.createLogger({
  level: config.env === 'development' ? 'debug' : 'info', // Log everything in development, only info and above in production
  levels,
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    json(),
  ),
  defaultMeta: { service: 'memory-service' },
  transports: [
    // Write all logs with level 'error' and below to 'error.log'
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // Write all logs with level 'info' and below to 'combined.log'
    new winston.transports.File({ 
      filename: 'logs/combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
  exitOnError: false, // Don't exit on handled exceptions
});

// If we're not in production, log to the console as well
if (config.env !== 'production') {
  logger.add(new winston.transports.Console({
    format: combine(
      colorize({ all: true }),
      timestamp({ format: 'HH:mm:ss' }),
      consoleFormat,
    ),
  }));
}

// Create a stream object with a 'write' function that will be used by Morgan
// This allows us to use winston for HTTP request logging
// Example usage: app.use(morgan('combined', { stream: logger.stream }));
const stream = {
  write: (message: string) => {
    logger.http(message.trim());
  },
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Recommended: send the information to an error tracking service
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception thrown:', error);
  // Recommended: send the information to an error tracking service
  process.exit(1); // Mandatory (as per the Node.js docs)
});

export { logger, stream };
