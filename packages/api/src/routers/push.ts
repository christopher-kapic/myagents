import prisma from "@myagents/db";
import { env } from "@myagents/env/server";
import { z } from "zod";

import { adminProcedure, protectedProcedure } from "../index";

export const pushRouter = {
  subscribe: protectedProcedure
    .input(
      z.object({
        endpoint: z.string().url(),
        keys: z.object({
          p256dh: z.string(),
          auth: z.string(),
        }),
      }),
    )
    .handler(async ({ input, context }) => {
      await prisma.pushSubscription.upsert({
        where: { endpoint: input.endpoint },
        update: {
          p256dh: input.keys.p256dh,
          auth: input.keys.auth,
          userId: context.session.user.id,
        },
        create: {
          endpoint: input.endpoint,
          p256dh: input.keys.p256dh,
          auth: input.keys.auth,
          userId: context.session.user.id,
        },
      });
      return { success: true };
    }),

  unsubscribe: protectedProcedure
    .input(z.object({ endpoint: z.string().url() }))
    .handler(async ({ input, context }) => {
      await prisma.pushSubscription.deleteMany({
        where: {
          endpoint: input.endpoint,
          userId: context.session.user.id,
        },
      });
      return { success: true };
    }),

  send: adminProcedure
    .input(
      z.object({
        title: z.string(),
        body: z.string(),
        url: z.string().optional(),
        userId: z.string().optional(),
      }),
    )
    .handler(async ({ input }) => {
      const { sendPushNotification } = await import("../lib/web-push");

      const where = input.userId ? { userId: input.userId } : {};
      const subscriptions = await prisma.pushSubscription.findMany({ where });

      const payload = JSON.stringify({
        title: input.title,
        body: input.body,
        data: { url: input.url ?? "/" },
      });

      const results = await Promise.allSettled(
        subscriptions.map(async (sub) => {
          try {
            await sendPushNotification(
              {
                endpoint: sub.endpoint,
                keys: { p256dh: sub.p256dh, auth: sub.auth },
              },
              payload,
            );
          } catch (err: any) {
            if (err.statusCode === 410 || err.statusCode === 404) {
              await prisma.pushSubscription.delete({ where: { id: sub.id } });
            }
            throw err;
          }
        }),
      );

      const sent = results.filter((r) => r.status === "fulfilled").length;
      return { sent, total: subscriptions.length };
    }),

  vapidPublicKey: protectedProcedure.handler(() => {
    return { key: env.VAPID_PUBLIC_KEY ?? null };
  }),
};
