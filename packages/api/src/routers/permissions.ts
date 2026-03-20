import { ORPCError } from "@orpc/server";
import prisma from "@myagents/db";
import { z } from "zod";

import { protectedProcedure } from "../index";

function isAdmin(context: { session: { user: { role?: string | null } } }): boolean {
  return context.session.user.role === "admin";
}

export const permissionsRouter = {
  grant: protectedProcedure
    .input(
      z.object({
        agentId: z.string(),
        targetAgentId: z.string(),
      }),
    )
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      const admin = isAdmin(context);

      // Verify the source agent belongs to the authenticated user (admin can grant for any agent)
      const sourceAgent = await prisma.agent.findUnique({
        where: { id: input.agentId },
        select: { userId: true },
      });

      if (!sourceAgent || (!admin && sourceAgent.userId !== userId)) {
        throw new ORPCError("NOT_FOUND", {
          message: "Source agent not found",
        });
      }

      // Verify target agent exists
      const targetAgent = await prisma.agent.findUnique({
        where: { id: input.targetAgentId },
        select: { userId: true },
      });

      if (!targetAgent) {
        throw new ORPCError("NOT_FOUND", {
          message: "Target agent not found",
        });
      }

      // Cross-user permission: target agent must have an active share for this user (admin can override)
      if (!admin && targetAgent.userId !== userId) {
        const hasShare = await prisma.agentShare.findFirst({
          where: {
            agentId: input.targetAgentId,
            userId,
            active: true,
          },
        });

        if (!hasShare) {
          throw new ORPCError("FORBIDDEN", {
            message: "Target agent is not shared with you",
          });
        }
      }

      // Prevent self-permission
      if (input.agentId === input.targetAgentId) {
        throw new ORPCError("BAD_REQUEST", {
          message: "An agent cannot grant permission to itself",
        });
      }

      const permission = await prisma.agentPermission.upsert({
        where: {
          agentId_targetAgentId: {
            agentId: input.agentId,
            targetAgentId: input.targetAgentId,
          },
        },
        create: {
          agentId: input.agentId,
          targetAgentId: input.targetAgentId,
          createdBy: userId,
        },
        update: {},
        select: {
          id: true,
          agentId: true,
          targetAgentId: true,
          createdAt: true,
        },
      });

      return permission;
    }),

  revoke: protectedProcedure
    .input(
      z.object({
        agentId: z.string(),
        targetAgentId: z.string(),
      }),
    )
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      const admin = isAdmin(context);

      // Verify the source agent belongs to the authenticated user (admin can revoke for any agent)
      const sourceAgent = await prisma.agent.findUnique({
        where: { id: input.agentId },
        select: { userId: true },
      });

      if (!sourceAgent || (!admin && sourceAgent.userId !== userId)) {
        throw new ORPCError("NOT_FOUND", {
          message: "Agent not found",
        });
      }

      const existing = await prisma.agentPermission.findUnique({
        where: {
          agentId_targetAgentId: {
            agentId: input.agentId,
            targetAgentId: input.targetAgentId,
          },
        },
      });

      if (!existing) {
        throw new ORPCError("NOT_FOUND", {
          message: "Permission not found",
        });
      }

      await prisma.agentPermission.delete({
        where: {
          agentId_targetAgentId: {
            agentId: input.agentId,
            targetAgentId: input.targetAgentId,
          },
        },
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

      // Verify the agent belongs to the authenticated user (admin can list any agent's permissions)
      const agent = await prisma.agent.findUnique({
        where: { id: input.agentId },
        select: { userId: true },
      });

      if (!agent || (!admin && agent.userId !== userId)) {
        throw new ORPCError("NOT_FOUND", {
          message: "Agent not found",
        });
      }

      // Permissions where this agent can send messages TO other agents
      const canSendTo = await prisma.agentPermission.findMany({
        where: { agentId: input.agentId },
        select: {
          id: true,
          targetAgentId: true,
          createdAt: true,
          targetAgent: {
            select: {
              id: true,
              slug: true,
              name: true,
              type: true,
              status: true,
              userId: true,
              user: { select: { username: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      // Permissions where other agents can send messages TO this agent
      const canReceiveFrom = await prisma.agentPermission.findMany({
        where: { targetAgentId: input.agentId },
        select: {
          id: true,
          agentId: true,
          createdAt: true,
          agent: {
            select: {
              id: true,
              slug: true,
              name: true,
              type: true,
              status: true,
              userId: true,
              user: { select: { username: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      return {
        canSendTo: canSendTo.map((p) => ({
          id: p.id,
          createdAt: p.createdAt,
          agent: {
            id: p.targetAgent.id,
            slug: p.targetAgent.slug,
            name: p.targetAgent.name,
            type: String(p.targetAgent.type),
            status: String(p.targetAgent.status),
            userId: p.targetAgent.userId,
            username: p.targetAgent.user?.username,
          },
        })),
        canReceiveFrom: canReceiveFrom.map((p) => ({
          id: p.id,
          createdAt: p.createdAt,
          agent: {
            id: p.agent.id,
            slug: p.agent.slug,
            name: p.agent.name,
            type: String(p.agent.type),
            status: String(p.agent.status),
            userId: p.agent.userId,
            username: p.agent.user?.username,
          },
        })),
      };
    }),
};
