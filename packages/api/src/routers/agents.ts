import { ORPCError } from "@orpc/server";
import prisma from "@myagents/db";
import { z } from "zod";

import { protectedProcedure } from "../index";

const agentSelect = {
  id: true,
  slug: true,
  name: true,
  description: true,
  type: true,
  status: true,
  shared: true,
  nodeId: true,
  userId: true,
  adapterConfig: true,
  node: { select: { id: true, name: true, status: true } },
} as const;

const agentWithOwnerSelect = {
  ...agentSelect,
  user: { select: { username: true } },
} as const;

function serializeAgent(agent: Record<string, unknown>) {
  return {
    ...agent,
    type: String(agent.type),
    status: String(agent.status),
    node: agent.node
      ? {
          ...(agent.node as Record<string, unknown>),
          status: String((agent.node as Record<string, unknown>).status),
        }
      : undefined,
  };
}

export const agentsRouter = {
  list: protectedProcedure
    .input(
      z
        .object({
          search: z.string().optional(),
          type: z.enum(["hermes", "openclaw", "custom"]).optional(),
          status: z.enum(["online", "offline"]).optional(),
          nodeId: z.string().optional(),
        })
        .optional(),
    )
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      const filters = input ?? {};

      const where: Record<string, unknown> = { userId };

      if (filters.type) where.type = filters.type;
      if (filters.status) where.status = filters.status;
      if (filters.nodeId) where.nodeId = filters.nodeId;
      if (filters.search) {
        where.OR = [
          { name: { contains: filters.search, mode: "insensitive" } },
          { slug: { contains: filters.search, mode: "insensitive" } },
          {
            description: { contains: filters.search, mode: "insensitive" },
          },
        ];
      }

      const ownAgents = await prisma.agent.findMany({
        where,
        select: agentSelect,
        orderBy: { name: "asc" },
      });

      // Find shared agents from other users that this user has permissions to access
      const sharedPermissions = await prisma.agentPermission.findMany({
        where: {
          createdBy: userId,
          targetAgent: {
            userId: { not: userId },
            shared: true,
          },
        },
        select: { targetAgentId: true },
      });

      const sharedAgentIds = sharedPermissions.map((p) => p.targetAgentId);

      let sharedAgents: Array<Record<string, unknown>> = [];
      if (sharedAgentIds.length > 0) {
        const sharedWhere: Record<string, unknown> = {
          id: { in: sharedAgentIds },
        };

        if (filters.type) sharedWhere.type = filters.type;
        if (filters.status) sharedWhere.status = filters.status;
        if (filters.search) {
          sharedWhere.OR = [
            { name: { contains: filters.search, mode: "insensitive" } },
            { slug: { contains: filters.search, mode: "insensitive" } },
            {
              description: {
                contains: filters.search,
                mode: "insensitive",
              },
            },
          ];
        }

        sharedAgents = await prisma.agent.findMany({
          where: sharedWhere,
          select: agentWithOwnerSelect,
          orderBy: { name: "asc" },
        });
      }

      return {
        own: ownAgents.map(serializeAgent),
        shared: sharedAgents.map(serializeAgent),
      };
    }),

  get: protectedProcedure
    .input(
      z.object({
        slug: z.string().min(1),
      }),
    )
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;

      // Check if slug contains "/" for cross-user lookup (username/slug format)
      const slashIndex = input.slug.indexOf("/");

      if (slashIndex === -1) {
        // Bare slug — look up own agent
        const agent = await prisma.agent.findUnique({
          where: { userId_slug: { userId, slug: input.slug } },
          select: agentSelect,
        });

        if (!agent) {
          throw new ORPCError("NOT_FOUND", {
            message: "Agent not found",
          });
        }

        return serializeAgent(agent);
      }

      // Cross-user: username/slug format
      const username = input.slug.substring(0, slashIndex);
      const agentSlug = input.slug.substring(slashIndex + 1);

      const owner = await prisma.user.findUnique({
        where: { username },
        select: { id: true, username: true },
      });

      if (!owner) {
        throw new ORPCError("NOT_FOUND", {
          message: "Agent not found",
        });
      }

      const agent = await prisma.agent.findUnique({
        where: { userId_slug: { userId: owner.id, slug: agentSlug } },
        select: agentWithOwnerSelect,
      });

      if (!agent || !agent.shared) {
        throw new ORPCError("NOT_FOUND", {
          message: "Agent not found",
        });
      }

      // Check that the requesting user has permission to access this shared agent
      const hasPermission = await prisma.agentPermission.findFirst({
        where: {
          targetAgentId: agent.id,
          createdBy: userId,
        },
      });

      if (!hasPermission) {
        throw new ORPCError("NOT_FOUND", {
          message: "Agent not found",
        });
      }

      return serializeAgent(agent);
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(255).optional(),
        description: z.string().max(1000).nullish(),
      }),
    )
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;

      const agent = await prisma.agent.findUnique({
        where: { id: input.id },
        select: { userId: true },
      });

      if (!agent || agent.userId !== userId) {
        throw new ORPCError("NOT_FOUND", {
          message: "Agent not found",
        });
      }

      const data: Record<string, unknown> = {};
      if (input.name !== undefined) data.name = input.name;
      if (input.description !== undefined) data.description = input.description;

      const updated = await prisma.agent.update({
        where: { id: input.id },
        data,
        select: agentSelect,
      });

      return serializeAgent(updated);
    }),

  remove: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;

      const agent = await prisma.agent.findUnique({
        where: { id: input.id },
        select: { userId: true },
      });

      if (!agent || agent.userId !== userId) {
        throw new ORPCError("NOT_FOUND", {
          message: "Agent not found",
        });
      }

      await prisma.agent.delete({
        where: { id: input.id },
      });

      return { success: true };
    }),
};
