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
  rateLimitPerMin: true,
  circuitBreakerThreshold: true,
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

function isAdmin(context: { session: { user: { role?: string | null } } }): boolean {
  return context.session.user.role === "admin";
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
          forAgentSlug: z.string().optional(),
        })
        .optional(),
    )
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      const admin = isAdmin(context);
      const filters = input ?? {};

      // Agent-perspective: return only agents the specified agent has permission to send to
      if (filters.forAgentSlug) {
        const senderAgent = await prisma.agent.findUnique({
          where: { userId_slug: { userId, slug: filters.forAgentSlug } },
          select: { id: true },
        });

        if (!senderAgent) {
          throw new ORPCError("NOT_FOUND", {
            message: "Agent not found",
          });
        }

        const permissionWhere: Record<string, unknown> = {
          agentId: senderAgent.id,
        };

        const targetFilters: Record<string, unknown> = {};
        if (filters.type) targetFilters.type = filters.type;
        if (filters.status) targetFilters.status = filters.status;
        if (filters.search) {
          targetFilters.OR = [
            { name: { contains: filters.search, mode: "insensitive" } },
            { slug: { contains: filters.search, mode: "insensitive" } },
            { description: { contains: filters.search, mode: "insensitive" } },
          ];
        }
        if (Object.keys(targetFilters).length > 0) {
          permissionWhere.targetAgent = targetFilters;
        }

        const permissions = await prisma.agentPermission.findMany({
          where: permissionWhere,
          select: {
            targetAgent: {
              select: agentWithOwnerSelect,
            },
          },
        });

        const agents = permissions.map((p) => {
          const agent = p.targetAgent as Record<string, unknown>;
          const isCrossUser = agent.userId !== userId;
          const username = (agent.user as { username?: string | null } | null)?.username;
          return {
            ...serializeAgent(agent),
            owner: isCrossUser ? (username ?? null) : null,
            address: isCrossUser && username
              ? `${username}/${String(agent.slug)}`
              : String(agent.slug),
          };
        });

        return {
          own: [],
          shared: [],
          permitted: agents,
        };
      }

      // Admin-perspective: see all agents across all users
      if (admin) {
        const where: Record<string, unknown> = {};
        if (filters.type) where.type = filters.type;
        if (filters.status) where.status = filters.status;
        if (filters.nodeId) where.nodeId = filters.nodeId;
        if (filters.search) {
          where.OR = [
            { name: { contains: filters.search, mode: "insensitive" } },
            { slug: { contains: filters.search, mode: "insensitive" } },
            { description: { contains: filters.search, mode: "insensitive" } },
          ];
        }

        const allAgents = await prisma.agent.findMany({
          where,
          select: agentWithOwnerSelect,
          orderBy: { name: "asc" },
        });

        const ownAgents = allAgents.filter((a) => a.userId === userId);
        const otherAgents = allAgents.filter((a) => a.userId !== userId);

        return {
          own: ownAgents.map(serializeAgent),
          shared: otherAgents.map(serializeAgent),
        };
      }

      // User-perspective: own agents + shared agents
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
      const admin = isAdmin(context);

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

      if (!agent) {
        throw new ORPCError("NOT_FOUND", {
          message: "Agent not found",
        });
      }

      // Admin can access any agent; non-admin requires shared + permission
      if (!admin) {
        if (!agent.shared) {
          throw new ORPCError("NOT_FOUND", {
            message: "Agent not found",
          });
        }

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
      const admin = isAdmin(context);

      const agent = await prisma.agent.findUnique({
        where: { id: input.id },
        select: { userId: true },
      });

      if (!agent || (!admin && agent.userId !== userId)) {
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
      const admin = isAdmin(context);

      const agent = await prisma.agent.findUnique({
        where: { id: input.id },
        select: { userId: true },
      });

      if (!agent || (!admin && agent.userId !== userId)) {
        throw new ORPCError("NOT_FOUND", {
          message: "Agent not found",
        });
      }

      await prisma.agent.delete({
        where: { id: input.id },
      });

      return { success: true };
    }),

  share: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      const admin = isAdmin(context);

      const agent = await prisma.agent.findUnique({
        where: { id: input.id },
        select: { userId: true },
      });

      if (!agent || (!admin && agent.userId !== userId)) {
        throw new ORPCError("NOT_FOUND", {
          message: "Agent not found",
        });
      }

      const updated = await prisma.agent.update({
        where: { id: input.id },
        data: { shared: true },
        select: agentSelect,
      });

      return serializeAgent(updated);
    }),

  unshare: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      const admin = isAdmin(context);

      const agent = await prisma.agent.findUnique({
        where: { id: input.id },
        select: { userId: true },
      });

      if (!agent || (!admin && agent.userId !== userId)) {
        throw new ORPCError("NOT_FOUND", {
          message: "Agent not found",
        });
      }

      const updated = await prisma.agent.update({
        where: { id: input.id },
        data: { shared: false },
        select: agentSelect,
      });

      return serializeAgent(updated);
    }),

  setRateLimit: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        rateLimitPerMin: z.number().int().min(1).max(10000),
        circuitBreakerThreshold: z.number().int().min(1).max(10000),
      }),
    )
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      const admin = isAdmin(context);

      const agent = await prisma.agent.findUnique({
        where: { id: input.id },
        select: { userId: true },
      });

      if (!agent || (!admin && agent.userId !== userId)) {
        throw new ORPCError("NOT_FOUND", {
          message: "Agent not found",
        });
      }

      const updated = await prisma.agent.update({
        where: { id: input.id },
        data: {
          rateLimitPerMin: input.rateLimitPerMin,
          circuitBreakerThreshold: input.circuitBreakerThreshold,
        },
        select: agentSelect,
      });

      return serializeAgent(updated);
    }),

  getRateLimit: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      const admin = isAdmin(context);

      const agent = await prisma.agent.findUnique({
        where: { id: input.id },
        select: { userId: true, rateLimitPerMin: true, circuitBreakerThreshold: true },
      });

      if (!agent || (!admin && agent.userId !== userId)) {
        throw new ORPCError("NOT_FOUND", {
          message: "Agent not found",
        });
      }

      return {
        rateLimitPerMin: agent.rateLimitPerMin,
        circuitBreakerThreshold: agent.circuitBreakerThreshold,
      };
    }),
};
