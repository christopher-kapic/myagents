import type { RouterClient } from "@orpc/server";
import prisma from "@myagents/db";
import { env } from "@myagents/env/server";

import { protectedProcedure, publicProcedure } from "../index";
import { isSmtpConfigured } from "../lib/email";
import { agentsRouter } from "./agents";
import { apiKeysRouter } from "./apiKeys";
import { conversationsRouter, messagesRouter, queuedMessagesRouter } from "./conversations";
import { healthRouter } from "./health";
import { invitationsRouter } from "./invitations";
import { permissionsRouter } from "./permissions";
import { pushRouter } from "./push";
import { settingsRouter } from "./settings";

export const appRouter = {
  healthCheck: publicProcedure.handler(() => {
    return "OK";
  }),
  appConfig: publicProcedure.handler(async () => {
    const setting = await prisma.appSetting.findUnique({
      where: { key: "signupsDisabled" },
    });
    return {
      ssoEnabled: env.SSO_ENABLED === "true",
      forceSso: env.FORCE_SSO === "true",
      ssoProviderName: env.SSO_PROVIDER_NAME,
      signupsDisabled: setting?.value === "true",
      smtpConfigured: isSmtpConfigured(),
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
  queuedMessages: queuedMessagesRouter,
  permissions: permissionsRouter,
  health: healthRouter,
  invitations: invitationsRouter,
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
