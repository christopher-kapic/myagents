import { ORPCError } from "@orpc/server";
import { createHash, randomBytes } from "node:crypto";
import prisma from "@myagents/db";
import { z } from "zod";

import { protectedProcedure } from "../index";

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export const apiKeysRouter = {
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
      }),
    )
    .handler(async ({ input, context }) => {
      const plaintext = `myagents_${randomBytes(32).toString("hex")}`;
      const keyHash = hashKey(plaintext);

      const apiKey = await prisma.apiKey.create({
        data: {
          name: input.name,
          keyHash,
          userId: context.session.user.id,
        },
      });

      return {
        id: apiKey.id,
        name: apiKey.name,
        key: plaintext,
        createdAt: apiKey.createdAt,
      };
    }),

  list: protectedProcedure.handler(async ({ context }) => {
    const keys = await prisma.apiKey.findMany({
      where: { userId: context.session.user.id },
      select: {
        id: true,
        name: true,
        createdAt: true,
        lastUsedAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return keys;
  }),

  revoke: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .handler(async ({ input, context }) => {
      const apiKey = await prisma.apiKey.findUnique({
        where: { id: input.id },
      });

      if (!apiKey || apiKey.userId !== context.session.user.id) {
        throw new ORPCError("NOT_FOUND", {
          message: "API key not found",
        });
      }

      await prisma.apiKey.delete({
        where: { id: input.id },
      });

      return { success: true };
    }),
};
