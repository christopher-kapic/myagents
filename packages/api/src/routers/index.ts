import type { RouterClient } from "@orpc/server";
import { env } from "@myagents/env/server";

import { protectedProcedure, publicProcedure } from "../index";
import { agentsRouter } from "./agents";
import { apiKeysRouter } from "./apiKeys";
import { conversationsRouter, messagesRouter } from "./conversations";
import { healthRouter } from "./health";
import { permissionsRouter } from "./permissions";
import { pushRouter } from "./push";
import { settingsRouter } from "./settings";

export const appRouter = {
  healthCheck: publicProcedure.handler(() => {
    return "OK";
  }),
  appConfig: publicProcedure.handler(() => {
    return {
      ssoEnabled: env.SSO_ENABLED === "true",
      forceSso: env.FORCE_SSO === "true",
      ssoProviderName: env.SSO_PROVIDER_NAME,
    };
  }),
  privateData: protectedProcedure.handler(({ context }) => {
    return {
      message: "This is private",
      user: context.session?.user,
    };
  }),
  settings: settingsRouter,
  push: pushRouter,
  apiKeys: apiKeysRouter,
  agents: agentsRouter,
  conversations: conversationsRouter,
  messages: messagesRouter,
  permissions: permissionsRouter,
  health: healthRouter,
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
