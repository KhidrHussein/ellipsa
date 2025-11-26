import winston from 'winston';
const { combine, timestamp, printf, colorize, align } = winston.format;
const logFormat = printf((info) => {
    const { level, message, timestamp, ...meta } = info;
    const metaString = Object.keys(meta).length > 0 ? `\n${JSON.stringify(meta, null, 2)}` : '';
    return `${timestamp} [${level}]: ${message}${metaString}`;
});
export const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: combine(colorize({ all: true }), timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), align(), logFormat // Type assertion to handle winston's internal types
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({
            filename: 'logs/error.log',
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 5,
        }),
        new winston.transports.File({
            filename: 'logs/combined.log',
            maxsize: 5242880, // 5MB
            maxFiles: 5,
        }),
    ],
});
// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    process.exit(1);
});
// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
export default logger;
//# sourceMappingURL=logger.js.map