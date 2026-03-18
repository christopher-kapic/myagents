#!/usr/bin/env node
import { Command } from "commander";
import { connectCommand } from "./commands/connect.js";
import { agentCommand } from "./commands/agent.js";

const program = new Command()
  .name("myagents")
  .description("MyAgents CLI - Connect your machine to the MyAgents server")
  .version("0.1.0");

program.addCommand(connectCommand);
program.addCommand(agentCommand);

program.parse();
