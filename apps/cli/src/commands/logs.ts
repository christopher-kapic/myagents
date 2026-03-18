import { Command } from "commander";
import { readFileSync, existsSync, watchFile, unwatchFile } from "node:fs";
import { getCurrentLogFile, listLogFiles, getLogsDir } from "../logger.js";

export const logsCommand = new Command("logs")
  .description("View CLI connector logs")
  .option("-n, --lines <count>", "Number of lines to show", "50")
  .option("-f, --follow", "Follow the log file (like tail -f)")
  .option("--all", "Show logs from all rotated files")
  .option("--clear", "Clear all log files")
  .action(
    async (opts: {
      lines?: string;
      follow?: boolean;
      all?: boolean;
      clear?: boolean;
    }) => {
      const logsDir = getLogsDir();

      if (opts.clear) {
        const files = listLogFiles();
        if (files.length === 0) {
          console.log("No log files to clear.");
          return;
        }
        const { unlinkSync } = await import("node:fs");
        for (const file of files) {
          try {
            unlinkSync(file);
          } catch {
            // Best-effort
          }
        }
        console.log(`Cleared ${files.length} log file(s) from ${logsDir}`);
        return;
      }

      const lineCount = parseInt(opts.lines ?? "50", 10);

      if (opts.all) {
        // Show logs from all rotated files (oldest first)
        const files = listLogFiles().reverse();
        if (files.length === 0) {
          console.log(`No log files found in ${logsDir}`);
          return;
        }

        for (const file of files) {
          const lines = readLastLines(file, lineCount);
          if (lines.length > 0) {
            console.log(lines.join("\n"));
          }
        }
        return;
      }

      const logFile = getCurrentLogFile();
      if (!existsSync(logFile)) {
        console.log(`No log file found at ${logFile}`);
        console.log("Logs will be created when the CLI connector runs.");
        return;
      }

      // Show last N lines
      const lines = readLastLines(logFile, lineCount);
      if (lines.length === 0) {
        console.log("Log file is empty.");
      } else {
        console.log(lines.join("\n"));
      }

      // Follow mode
      if (opts.follow) {
        console.log("\n--- Following log file (Ctrl+C to stop) ---\n");
        let lastSize = 0;
        try {
          const stats = await import("node:fs").then((fs) =>
            fs.statSync(logFile),
          );
          lastSize = stats.size;
        } catch {
          // Start from current position
        }

        watchFile(logFile, { interval: 500 }, () => {
          try {
            const content = readFileSync(logFile, "utf-8");
            const bytes = Buffer.byteLength(content, "utf-8");
            if (bytes > lastSize) {
              // Read only the new content
              const buf = Buffer.from(content, "utf-8");
              const newContent = buf.subarray(lastSize).toString("utf-8");
              if (newContent.trim()) {
                process.stdout.write(newContent);
              }
              lastSize = bytes;
            }
          } catch {
            // File may have been rotated
          }
        });

        // Handle graceful shutdown
        const cleanup = () => {
          unwatchFile(logFile);
          process.exit(0);
        };
        process.on("SIGINT", cleanup);
        process.on("SIGTERM", cleanup);

        // Keep process alive
        await new Promise(() => {
          // Never resolves — we stay alive until SIGINT/SIGTERM
        });
      }
    },
  );

/**
 * Read the last N lines from a file.
 */
function readLastLines(filePath: string, count: number): string[] {
  try {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n").filter((l) => l.length > 0);
    return lines.slice(-count);
  } catch {
    return [];
  }
}
