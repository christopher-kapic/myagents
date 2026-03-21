import { ORPCError } from "@orpc/server";
import prisma from "@myagents/db";
import { z } from "zod";

import { protectedProcedure } from "../index";

function isAdmin(context: { session: { user: { role?: string | null } } }): boolean {
  return context.session.user.role === "admin";
}

export const agentSharesRouter = {
  create: protectedProcedure
    .input(
      z.object({
        agentId: z.string(),
        email: z.string().email(),
      }),
    )
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      const admin = isAdmin(context);

      // Verify the agent exists and caller is the owner
      const agent = await prisma.agent.findUnique({
        where: { id: input.agentId },
        select: { userId: true },
      });

      if (!agent || (!admin && agent.userId !== userId)) {
        throw new ORPCError("NOT_FOUND", {
          message: "Agent not found",
        });
      }

      // Look up the target user by email
      const targetUser = await prisma.user.findUnique({
        where: { email: input.email },
        select: { id: true, name: true, email: true },
      });

      if (!targetUser) {
        throw new ORPCError("NOT_FOUND", {
          message: "No user found with that email address",
        });
      }

      // Prevent self-share
      if (targetUser.id === agent.userId) {
        throw new ORPCError("BAD_REQUEST", {
          message: "You cannot share an agent with yourself",
        });
      }

      // Upsert: if share already exists, reactivate it
      const share = await prisma.agentShare.upsert({
        where: {
          agentId_userId: {
            agentId: input.agentId,
            userId: targetUser.id,
          },
        },
        create: {
          agentId: input.agentId,
          userId: targetUser.id,
        },
        update: {
          active: true,
        },
        select: {
          id: true,
          agentId: true,
          userId: true,
          active: true,
          createdAt: true,
          user: { select: { id: true, name: true, email: true } },
        },
      });

      return share;
    }),

  toggle: protectedProcedure
    .input(
      z.object({
        shareId: z.string(),
        active: z.boolean(),
      }),
    )
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      const admin = isAdmin(context);

      const share = await prisma.agentShare.findUnique({
        where: { id: input.shareId },
        select: { agent: { select: { userId: true } } },
      });

      if (!share || (!admin && share.agent.userId !== userId)) {
        throw new ORPCError("NOT_FOUND", {
          message: "Share not found",
        });
      }

      const updated = await prisma.agentShare.update({
        where: { id: input.shareId },
        data: { active: input.active },
        select: {
          id: true,
          agentId: true,
          userId: true,
          active: true,
          createdAt: true,
          user: { select: { id: true, name: true, email: true } },
        },
      });

      return updated;
    }),

  remove: protectedProcedure
    .input(
      z.object({
        shareId: z.string(),
      }),
    )
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      const admin = isAdmin(context);

      const share = await prisma.agentShare.findUnique({
        where: { id: input.shareId },
        select: { agent: { select: { userId: true } } },
      });

      if (!share || (!admin && share.agent.userId !== userId)) {
        throw new ORPCError("NOT_FOUND", {
          message: "Share not found",
        });
      }

      await prisma.agentShare.delete({
        where: { id: input.shareId },
      });

      return { success: true };
    }),

  list: protectedProcedure
    .input(
      z.object({
        agentId: z.string(),
      }),
    )
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      const admin = isAdmin(context);

      // Verify the agent exists and caller is the owner
      const agent = await prisma.agent.findUnique({
        where: { id: input.agentId },
        select: { userId: true },
      });

      if (!agent || (!admin && agent.userId !== userId)) {
        throw new ORPCError("NOT_FOUND", {
          message: "Agent not found",
        });
      }

      const shares = await prisma.agentShare.findMany({
        where: { agentId: input.agentId },
        select: {
          id: true,
          agentId: true,
          userId: true,
          active: true,
          createdAt: true,
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      return shares;
    }),

  listSharedWithMe: protectedProcedure.handler(async ({ context }) => {
    const userId = context.session.user.id;

    const shares = await prisma.agentShare.findMany({
      where: {
        userId,
        active: true,
      },
      select: {
        id: true,
        agentId: true,
        active: true,
        createdAt: true,
        agent: {
          select: {
            id: true,
            slug: true,
            name: true,
            description: true,
            type: true,
            status: true,
            user: { select: { id: true, username: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return shares.map((s) => ({
      ...s,
      agent: {
        ...s.agent,
        type: String(s.agent.type),
        status: String(s.agent.status),
      },
    }));
  }),
};
