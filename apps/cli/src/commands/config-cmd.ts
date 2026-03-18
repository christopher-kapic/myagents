import { Command } from "commander";
import { loadConfig, saveConfig, type CliConfig } from "../config.js";

const VALID_KEYS: (keyof CliConfig)[] = ["apiKey", "serverUrl", "nodeId"];

export const configCommand = new Command("config").description(
  "Manage CLI configuration",
);

configCommand
  .command("get <key>")
  .description("Get a configuration value")
  .action((key: string) => {
    if (!isValidKey(key)) {
      console.error(`Unknown config key: ${key}`);
      console.error(`Valid keys: ${VALID_KEYS.join(", ")}`);
      process.exit(1);
    }

    const config = loadConfig();
    const value = config[key as keyof CliConfig];

    if (value === undefined) {
      console.log(`(not set)`);
    } else if (key === "apiKey") {
      // Mask API key for security
      const masked =
        String(value).length > 8
          ? String(value).slice(0, 4) + "..." + String(value).slice(-4)
          : "****";
      console.log(masked);
    } else {
      console.log(value);
    }
  });

configCommand
  .command("set <key> <value>")
  .description("Set a configuration value")
  .action((key: string, value: string) => {
    if (!isValidKey(key)) {
      console.error(`Unknown config key: ${key}`);
      console.error(`Valid keys: ${VALID_KEYS.join(", ")}`);
      process.exit(1);
    }

    const config = loadConfig();
    (config as Record<string, string>)[key] = value;
    saveConfig(config);
    console.log(`Set ${key} = ${key === "apiKey" ? "****" : value}`);
  });

configCommand
  .command("list")
  .description("List all configuration values")
  .action(() => {
    const config = loadConfig();

    if (Object.keys(config).length === 0) {
      console.log("No configuration set. Config file: ~/.myagents/config.json");
      return;
    }

    for (const key of VALID_KEYS) {
      const value = config[key];
      if (value !== undefined) {
        const display =
          key === "apiKey"
            ? String(value).length > 8
              ? String(value).slice(0, 4) + "..." + String(value).slice(-4)
              : "****"
            : value;
        console.log(`${key} = ${display}`);
      }
    }
  });

configCommand
  .command("unset <key>")
  .description("Remove a configuration value")
  .action((key: string) => {
    if (!isValidKey(key)) {
      console.error(`Unknown config key: ${key}`);
      console.error(`Valid keys: ${VALID_KEYS.join(", ")}`);
      process.exit(1);
    }

    const config = loadConfig();
    delete (config as Record<string, unknown>)[key];
    saveConfig(config);
    console.log(`Unset ${key}`);
  });

function isValidKey(key: string): boolean {
  return VALID_KEYS.includes(key as keyof CliConfig);
}
