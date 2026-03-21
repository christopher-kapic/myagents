import { ORPCError } from "@orpc/server";
import prisma from "@myagents/db";
import { z } from "zod";

import { protectedProcedure } from "../index";

function isAdmin(context: { session: { user: { role?: string | null } } }): boolean {
  return context.session.user.role === "admin";
}

export const permissionsRouter = {
  /**
   * Request permission for agentId (sender) to message targetAgentId (receiver).
   * Caller must own the sender agent.
   * Same-user shortcut: auto-approves if the caller owns both agents.
   */
  request: protectedProcedure
    .input(
      z.object({
        agentId: z.string(),
        targetAgentId: z.string(),
      }),
    )
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      const admin = isAdmin(context);

      // Verify the sender agent belongs to the authenticated user
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

      // Prevent self-permission
      if (input.agentId === input.targetAgentId) {
        throw new ORPCError("BAD_REQUEST", {
          message: "An agent cannot grant permission to itself",
        });
      }

      // Same-user shortcut: auto-approve if caller owns both agents
      const sameUser = sourceAgent.userId === targetAgent.userId;

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
          status: sameUser ? "approved" : "pending",
          senderEnabled: true,
          receiverEnabled: sameUser,
        },
        update: {
          senderEnabled: true,
          // If same user and it was previously rejected/disabled, re-approve
          ...(sameUser ? { status: "approved", receiverEnabled: true } : {}),
        },
        select: {
          id: true,
          agentId: true,
          targetAgentId: true,
          status: true,
          senderEnabled: true,
          receiverEnabled: true,
          createdAt: true,
        },
      });

      return permission;
    }),

  /**
   * Approve a pending permission request. Caller must own the target (receiver) agent.
   */
  approve: protectedProcedure
    .input(
      z.object({
        permissionId: z.string(),
      }),
    )
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      const admin = isAdmin(context);

      const permission = await prisma.agentPermission.findUnique({
        where: { id: input.permissionId },
        include: {
          targetAgent: { select: { userId: true } },
        },
      });

      if (!permission) {
        throw new ORPCError("NOT_FOUND", {
          message: "Permission not found",
        });
      }

      // Only target agent owner can approve
      if (!admin && permission.targetAgent.userId !== userId) {
        throw new ORPCError("FORBIDDEN", {
          message: "Only the target agent owner can approve requests",
        });
      }

      if (permission.status === "approved") {
        throw new ORPCError("BAD_REQUEST", {
          message: "Permission is already approved",
        });
      }

      const updated = await prisma.agentPermission.update({
        where: { id: input.permissionId },
        data: {
          status: "approved",
          receiverEnabled: true,
        },
        select: {
          id: true,
          agentId: true,
          targetAgentId: true,
          status: true,
          senderEnabled: true,
          receiverEnabled: true,
        },
      });

      return updated;
    }),

  /**
   * Reject (delete) a pending permission request. Caller must own the target (receiver) agent.
   */
  reject: protectedProcedure
    .input(
      z.object({
        permissionId: z.string(),
      }),
    )
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      const admin = isAdmin(context);

      const permission = await prisma.agentPermission.findUnique({
        where: { id: input.permissionId },
        include: {
          targetAgent: { select: { userId: true } },
        },
      });

      if (!permission) {
        throw new ORPCError("NOT_FOUND", {
          message: "Permission not found",
        });
      }

      if (!admin && permission.targetAgent.userId !== userId) {
        throw new ORPCError("FORBIDDEN", {
          message: "Only the target agent owner can reject requests",
        });
      }

      await prisma.agentPermission.delete({
        where: { id: input.permissionId },
      });

      return { success: true };
    }),

  /**
   * Toggle sender or receiver enabled state. Caller must own either the sender or target agent.
   * Same-user shortcut: if caller owns both agents, both toggles are updated together.
   */
  toggle: protectedProcedure
    .input(
      z.object({
        permissionId: z.string(),
        enabled: z.boolean(),
      }),
    )
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      const admin = isAdmin(context);

      const permission = await prisma.agentPermission.findUnique({
        where: { id: input.permissionId },
        include: {
          agent: { select: { userId: true } },
          targetAgent: { select: { userId: true } },
        },
      });

      if (!permission) {
        throw new ORPCError("NOT_FOUND", {
          message: "Permission not found",
        });
      }

      const ownsSender = permission.agent.userId === userId;
      const ownsTarget = permission.targetAgent.userId === userId;

      if (!admin && !ownsSender && !ownsTarget) {
        throw new ORPCError("FORBIDDEN", {
          message: "You do not own either agent in this permission",
        });
      }

      // Same-user shortcut: toggle both sides together
      const sameUser = ownsSender && ownsTarget;

      const data: Record<string, boolean> = {};
      if (sameUser || ownsSender) {
        data.senderEnabled = input.enabled;
      }
      if (sameUser || ownsTarget) {
        data.receiverEnabled = input.enabled;
      }

      const updated = await prisma.agentPermission.update({
        where: { id: input.permissionId },
        data,
        select: {
          id: true,
          agentId: true,
          targetAgentId: true,
          status: true,
          senderEnabled: true,
          receiverEnabled: true,
        },
      });

      return updated;
    }),

  /**
   * Revoke (delete) a permission. Either side's owner can revoke.
   */
  revoke: protectedProcedure
    .input(
      z.object({
        permissionId: z.string(),
      }),
    )
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      const admin = isAdmin(context);

      const permission = await prisma.agentPermission.findUnique({
        where: { id: input.permissionId },
        include: {
          agent: { select: { userId: true } },
          targetAgent: { select: { userId: true } },
        },
      });

      if (!permission) {
        throw new ORPCError("NOT_FOUND", {
          message: "Permission not found",
        });
      }

      const ownsSender = permission.agent.userId === userId;
      const ownsTarget = permission.targetAgent.userId === userId;

      if (!admin && !ownsSender && !ownsTarget) {
        throw new ORPCError("FORBIDDEN", {
          message: "You do not own either agent in this permission",
        });
      }

      await prisma.agentPermission.delete({
        where: { id: input.permissionId },
      });

      return { success: true };
    }),

  /**
   * List permissions for an agent: canSendTo, canReceiveFrom, and pendingIncoming.
   */
  list: protectedProcedure
    .input(
      z.object({
        agentId: z.string(),
      }),
    )
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      const admin = isAdmin(context);

      // Verify the agent belongs to the authenticated user
      const agent = await prisma.agent.findUnique({
        where: { id: input.agentId },
        select: { userId: true },
      });

      if (!agent || (!admin && agent.userId !== userId)) {
        throw new ORPCError("NOT_FOUND", {
          message: "Agent not found",
        });
      }

      const permissionAgentSelect = {
        id: true,
        slug: true,
        name: true,
        type: true,
        status: true,
        userId: true,
        user: { select: { username: true } },
      } as const;

      // Permissions where this agent can send messages TO other agents
      const canSendTo = await prisma.agentPermission.findMany({
        where: { agentId: input.agentId },
        select: {
          id: true,
          status: true,
          senderEnabled: true,
          receiverEnabled: true,
          targetAgentId: true,
          createdAt: true,
          targetAgent: {
            select: permissionAgentSelect,
          },
        },
        orderBy: { createdAt: "desc" },
      });

      // Permissions where other agents can send messages TO this agent (approved only)
      const canReceiveFrom = await prisma.agentPermission.findMany({
        where: {
          targetAgentId: input.agentId,
          status: "approved",
        },
        select: {
          id: true,
          status: true,
          senderEnabled: true,
          receiverEnabled: true,
          agentId: true,
          createdAt: true,
          agent: {
            select: permissionAgentSelect,
          },
        },
        orderBy: { createdAt: "desc" },
      });

      // Pending incoming requests for this agent
      const pendingIncoming = await prisma.agentPermission.findMany({
        where: {
          targetAgentId: input.agentId,
          status: "pending",
        },
        select: {
          id: true,
          agentId: true,
          createdAt: true,
          agent: {
            select: permissionAgentSelect,
          },
        },
        orderBy: { createdAt: "desc" },
      });

      const mapAgent = (a: {
        id: string;
        slug: string;
        name: string;
        type: string;
        status: string;
        userId: string;
        user: { username: string | null } | null;
      }) => ({
        id: a.id,
        slug: a.slug,
        name: a.name,
        type: String(a.type),
        status: String(a.status),
        userId: a.userId,
        username: a.user?.username,
      });

      return {
        canSendTo: canSendTo.map((p) => ({
          id: p.id,
          permissionStatus: p.status,
          senderEnabled: p.senderEnabled,
          receiverEnabled: p.receiverEnabled,
          createdAt: p.createdAt,
          agent: mapAgent(p.targetAgent),
        })),
        canReceiveFrom: canReceiveFrom.map((p) => ({
          id: p.id,
          permissionStatus: p.status,
          senderEnabled: p.senderEnabled,
          receiverEnabled: p.receiverEnabled,
          createdAt: p.createdAt,
          agent: mapAgent(p.agent),
        })),
        pendingIncoming: pendingIncoming.map((p) => ({
          id: p.id,
          createdAt: p.createdAt,
          agent: mapAgent(p.agent),
        })),
      };
    }),

  /**
   * List all pending incoming requests across all of the current user's agents.
   */
  listPending: protectedProcedure.handler(async ({ context }) => {
    const userId = context.session.user.id;

    const pending = await prisma.agentPermission.findMany({
      where: {
        status: "pending",
        targetAgent: { userId },
      },
      select: {
        id: true,
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
        targetAgent: {
          select: {
            id: true,
            slug: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return pending.map((p) => ({
      id: p.id,
      createdAt: p.createdAt,
      senderAgent: {
        id: p.agent.id,
        slug: p.agent.slug,
        name: p.agent.name,
        type: String(p.agent.type),
        status: String(p.agent.status),
        userId: p.agent.userId,
        username: p.agent.user?.username,
      },
      targetAgent: {
        id: p.targetAgent.id,
        slug: p.targetAgent.slug,
        name: p.targetAgent.name,
      },
    }));
  }),
};
