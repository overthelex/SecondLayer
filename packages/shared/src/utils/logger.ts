import winston from 'winston';
import { existsSync, mkdirSync } from 'fs';

export type Logger = winston.Logger;

export function createLogger(serviceName: string): Logger {
  const transports: winston.transport[] = [];

  // Console transport: always add unless MCP STDIO mode (stdout reserved for protocol)
  if (process.env.MCP_STDIO_MODE !== 'true') {
    transports.push(
      new winston.transports.Console({
        // Write warn/error to stderr, info/debug to stdout — Docker captures both
        stderrLevels: ['error', 'warn'],
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        ),
      })
    );
  }

  // File transports: only when logs/ directory exists or can be created
  // Skip in Docker containers where console output goes to docker logs
  if (process.env.LOG_TO_FILE !== 'false') {
    try {
      if (!existsSync('logs')) mkdirSync('logs', { recursive: true });
      transports.push(
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' })
      );
    } catch {
      // File logging unavailable — console-only mode
    }
  }

  return winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json()
    ),
    defaultMeta: { service: serviceName },
    transports,
  });
}

export const logger: Logger = createLogger('shared');
