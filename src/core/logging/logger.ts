/**
 * Structured JSON Logger
 */

import fs from 'node:fs';
import path from 'node:path';
import { nanoid } from 'nanoid';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  run_id?: string;
  market_id?: string;
  command?: string;
  [key: string]: unknown;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  run_id?: string;
  context?: LogContext;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class Logger {
  private level: LogLevel = 'info';
  private format: 'json' | 'pretty' = 'json';
  private logFile?: string;
  private context: LogContext = {};

  configure(options: { level?: LogLevel; format?: 'json' | 'pretty'; file?: string }): void {
    if (options.level) this.level = options.level;
    if (options.format) this.format = options.format;
    if (options.file) {
      this.logFile = options.file;
      const dir = path.dirname(options.file);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  setContext(ctx: LogContext): void {
    this.context = { ...this.context, ...ctx };
  }

  clearContext(): void {
    this.context = {};
  }

  child(ctx: LogContext): Logger {
    const child = new Logger();
    child.level = this.level;
    child.format = this.format;
    child.logFile = this.logFile;
    child.context = { ...this.context, ...ctx };
    return child;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.level];
  }

  private formatEntry(entry: LogEntry): string {
    if (this.format === 'pretty') {
      const levelColors: Record<LogLevel, string> = {
        debug: '\x1b[90m',
        info: '\x1b[36m',
        warn: '\x1b[33m',
        error: '\x1b[31m',
      };
      const reset = '\x1b[0m';
      const color = levelColors[entry.level];
      const runId = entry.run_id ? ` [${entry.run_id.slice(0, 8)}]` : '';
      return `${color}[${entry.level.toUpperCase()}]${reset}${runId} ${entry.message}`;
    }
    return JSON.stringify(entry);
  }

  private log(level: LogLevel, message: string, context?: LogContext): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      run_id: this.context.run_id || context?.run_id,
      context: { ...this.context, ...context },
    };

    const formatted = this.formatEntry(entry);

    if (level === 'error') {
      console.error(formatted);
    } else {
      console.log(formatted);
    }

    if (this.logFile) {
      fs.appendFileSync(this.logFile, JSON.stringify(entry) + '\n');
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
}

export const logger = new Logger();

export function createRunId(): string {
  return nanoid();
}

export function configureLogger(options: { level?: LogLevel; format?: 'json' | 'pretty'; file?: string }): void {
  logger.configure(options);
}

