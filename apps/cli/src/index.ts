#!/usr/bin/env node
import { Command } from "commander";
import { connectCommand } from "./commands/connect.js";
import { agentCommand } from "./commands/agent.js";
import { statusCommand } from "./commands/status.js";
import { logsCommand } from "./commands/logs.js";
import { configCommand } from "./commands/config-cmd.js";
import { chatCommand } from "./commands/chat.js";

const program = new Command()
  .name("myagents")
  .description("MyAgents CLI - Connect your machine to the MyAgents server")
  .version("0.1.0");

program.addCommand(connectCommand);
program.addCommand(agentCommand);
program.addCommand(chatCommand);
program.addCommand(statusCommand);
program.addCommand(logsCommand);
program.addCommand(configCommand);

program.parse();
