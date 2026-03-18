import {
  appendFileSync,
  mkdirSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { getConfigDir } from "./config.js";

const LOGS_DIR = join(getConfigDir(), "logs");
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB per log file
const MAX_LOG_FILES = 5;

function getLogFilePath(): string {
  return join(LOGS_DIR, "myagents.log");
}

/**
 * Rotate logs if the current log file exceeds MAX_LOG_SIZE.
 * Keeps at most MAX_LOG_FILES rotated files.
 */
function rotateIfNeeded(): void {
  const logFile = getLogFilePath();
  if (!existsSync(logFile)) return;

  try {
    const stats = statSync(logFile);
    if (stats.size < MAX_LOG_SIZE) return;
  } catch {
    return;
  }

  // Shift existing rotated files
  for (let i = MAX_LOG_FILES - 1; i >= 1; i--) {
    const older = join(LOGS_DIR, `myagents.log.${i}`);
    const newer = join(LOGS_DIR, `myagents.log.${i - 1}`);
    try {
      if (i === MAX_LOG_FILES - 1 && existsSync(older)) {
        unlinkSync(older);
      }
      if (existsSync(newer)) {
        renameSync(newer, older);
      }
    } catch {
      // Best-effort rotation
    }
  }

  // Rotate current log to .0
  try {
    renameSync(logFile, join(LOGS_DIR, "myagents.log.0"));
  } catch {
    // Best-effort
  }
}

/**
 * Ensure logs directory exists.
 */
export function ensureLogsDir(): void {
  mkdirSync(LOGS_DIR, { recursive: true });
}

/**
 * Append a log entry to the log file.
 */
export function log(level: "info" | "warn" | "error", message: string): void {
  ensureLogsDir();
  rotateIfNeeded();

  const timestamp = new Date().toISOString();
  const entry = `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;
  appendFileSync(getLogFilePath(), entry, "utf-8");
}

/**
 * Get the logs directory path.
 */
export function getLogsDir(): string {
  return LOGS_DIR;
}

/**
 * Get the current log file path.
 */
export function getCurrentLogFile(): string {
  return getLogFilePath();
}

/**
 * List all log files sorted by modification time (newest first).
 */
export function listLogFiles(): string[] {
  if (!existsSync(LOGS_DIR)) return [];

  try {
    return readdirSync(LOGS_DIR)
      .filter((f) => f.startsWith("myagents.log"))
      .map((f) => join(LOGS_DIR, f))
      .sort((a, b) => {
        try {
          return statSync(b).mtimeMs - statSync(a).mtimeMs;
        } catch {
          return 0;
        }
      });
  } catch {
    return [];
  }
}
