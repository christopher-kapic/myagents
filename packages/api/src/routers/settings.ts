import { ORPCError } from "@orpc/server";
import prisma from "@myagents/db";
import { z } from "zod";

import { adminProcedure, publicProcedure } from "../index";

export const settingsRouter = {
  getAll: publicProcedure.handler(async () => {
    const settings = await prisma.appSetting.findMany();
    return Object.fromEntries(settings.map((s) => [s.key, s.value]));
  }),

  update: adminProcedure
    .input(
      z.object({
        key: z.string(),
        value: z.string(),
      }),
    )
    .handler(async ({ input, context }) => {
      if (input.key === "force2fa" && input.value === "true") {
        if (!context.session.user.twoFactorEnabled) {
          throw new ORPCError("FORBIDDEN", {
            message: "You must enable 2FA for your own account before requiring it for others",
          });
        }
      }

      await prisma.appSetting.upsert({
        where: { key: input.key },
        update: { value: input.value },
        create: { key: input.key, value: input.value },
      });

      return { success: true };
    }),
};
