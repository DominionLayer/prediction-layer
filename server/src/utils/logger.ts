/**
 * Structured JSON Logger
 */

import { config } from '../config/index.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  request_id?: string;
  user_id?: string;
  model?: string;
  provider?: string;
  tokens?: number;
  latency_ms?: number;
  status?: number;
  [key: string]: unknown;
}

interface LogEntry extends LogContext {
  timestamp: string;
  level: LogLevel;
  message: string;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class Logger {
  private level: LogLevel;

  constructor() {
    this.level = config.logLevel;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.level];
  }

  private log(level: LogLevel, message: string, context?: LogContext): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...context,
    };

    const formatted = JSON.stringify(entry);

    if (level === 'error') {
      console.error(formatted);
    } else {
      console.log(formatted);
    }
  }

  debug(message: string, context?: LogContext): void {
    this.log('debug', message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log('warn', message, context);
  }

  error(message: string, context?: LogContext): void {
    this.log('error', message, context);
  }

  /**
   * Redact sensitive content from prompts
   */
  redactPrompt(content: string, maxLength: number = 100): string {
    if (!config.logPrompts) {
      if (content.length > maxLength) {
        return content.slice(0, maxLength) + '...[REDACTED]';
      }
      return '[CONTENT]';
    }
    return content;
  }
}

export const logger = new Logger();

