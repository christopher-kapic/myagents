import { ORPCError } from "@orpc/server";
import prisma from "@myagents/db";
import { z } from "zod";

import { protectedProcedure } from "../index";

const conversationSelect = {
  id: true,
  title: true,
  createdAt: true,
  updatedAt: true,
  readAt: true,
  agentId: true,
  userId: true,
  agent: {
    select: {
      id: true,
      slug: true,
      name: true,
      type: true,
      status: true,
    },
  },
} as const;

function serializeConversation(conv: Record<string, unknown>) {
  const agent = conv.agent as Record<string, unknown> | undefined;
  return {
    ...conv,
    agent: agent
      ? {
          ...agent,
          type: String(agent.type),
          status: String(agent.status),
        }
      : undefined,
  };
}

function isAdmin(context: { session: { user: { role?: string | null } } }): boolean {
  return context.session.user.role === "admin";
}

export const conversationsRouter = {
  listAll: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().min(1).max(100).optional(),
          cursor: z.string().optional(),
        })
        .optional(),
    )
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      const admin = isAdmin(context);
      const limit = input?.limit ?? 30;

      const conversations = await prisma.conversation.findMany({
        where: admin ? {} : { userId },
        select: {
          ...conversationSelect,
          messages: {
            select: {
              id: true,
              content: true,
              senderType: true,
              error: true,
              createdAt: true,
            },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
        orderBy: { updatedAt: "desc" },
        take: limit + 1,
        ...(input?.cursor
          ? {
              cursor: { id: input.cursor },
              skip: 1,
            }
          : {}),
      });

      const hasMore = conversations.length > limit;
      const items = hasMore ? conversations.slice(0, limit) : conversations;

      return {
        items: items.map((conv) => {
          const lastMessage = conv.messages[0];
          const { messages: _, ...rest } = conv;
          const hasUnread =
            lastMessage &&
            String(lastMessage.senderType) === "agent" &&
            !lastMessage.error &&
            (!conv.readAt || lastMessage.createdAt > conv.readAt);
          return {
            ...serializeConversation(rest),
            hasUnread: !!hasUnread,
            lastMessage: lastMessage
              ? {
                  id: lastMessage.id,
                  content:
                    lastMessage.content.length > 100
                      ? lastMessage.content.substring(0, 100) + "..."
                      : lastMessage.content,
                  senderType: String(lastMessage.senderType),
                  createdAt: lastMessage.createdAt,
                }
              : null,
          };
        }),
        nextCursor: hasMore ? items[items.length - 1]!.id : null,
      };
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

      // Verify the agent belongs to the user, is shared with them, or admin
      const agent = await prisma.agent.findUnique({
        where: { id: input.agentId },
        select: { userId: true },
      });

      if (!agent) {
        throw new ORPCError("NOT_FOUND", {
          message: "Agent not found",
        });
      }

      const isOwner = agent.userId === userId;

      // Build the where clause based on access level
      let conversationWhere: Record<string, unknown>;

      if (admin) {
        // Admin sees all conversations for the agent
        conversationWhere = { agentId: input.agentId };
      } else if (isOwner) {
        // Owner sees all conversations on their agent
        conversationWhere = { agentId: input.agentId };
      } else {
        // Non-owner: check for an active share
        const share = await prisma.agentShare.findFirst({
          where: {
            agentId: input.agentId,
            userId,
            active: true,
          },
          select: { id: true },
        });

        if (!share) {
          throw new ORPCError("NOT_FOUND", {
            message: "Agent not found",
          });
        }

        // Share recipient sees only conversations stamped with their share ID
        conversationWhere = { agentId: input.agentId, sharedVia: share.id };
      }

      const conversations = await prisma.conversation.findMany({
        where: conversationWhere,
        select: {
          ...conversationSelect,
          messages: {
            select: {
              id: true,
              content: true,
              senderType: true,
              error: true,
              createdAt: true,
            },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
        orderBy: { updatedAt: "desc" },
      });

      return conversations.map((conv) => {
        const lastMessage = conv.messages[0];
        const { messages: _, ...rest } = conv;
        const hasUnread =
          lastMessage &&
          String(lastMessage.senderType) === "agent" &&
          !lastMessage.error &&
          (!conv.readAt || lastMessage.createdAt > conv.readAt);
        return {
          ...serializeConversation(rest),
          hasUnread: !!hasUnread,
          lastMessage: lastMessage
            ? {
                id: lastMessage.id,
                content:
                  lastMessage.content.length > 100
                    ? lastMessage.content.substring(0, 100) + "..."
                    : lastMessage.content,
                senderType: String(lastMessage.senderType),
                createdAt: lastMessage.createdAt,
              }
            : null,
        };
      });
    }),

  get: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;

      const conversation = await prisma.conversation.findUnique({
        where: { id: input.id },
        select: {
          ...conversationSelect,
          messages: {
            select: {
              id: true,
              content: true,
              senderType: true,
              senderId: true,
              error: true,
              createdAt: true,
            },
            orderBy: { createdAt: "asc" },
          },
        },
      });

      if (!conversation || (!isAdmin(context) && conversation.userId !== userId)) {
        throw new ORPCError("NOT_FOUND", {
          message: "Conversation not found",
        });
      }

      const { messages, ...rest } = conversation;
      return {
        ...serializeConversation(rest),
        messages: messages.map((msg) => ({
          ...msg,
          senderType: String(msg.senderType),
        })),
      };
    }),

  create: protectedProcedure
    .input(
      z.object({
        agentId: z.string(),
        title: z.string().max(255).optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      const admin = isAdmin(context);

      // Verify the agent belongs to the user or is shared with them
      const agent = await prisma.agent.findUnique({
        where: { id: input.agentId },
        select: { userId: true },
      });

      if (!agent) {
        throw new ORPCError("NOT_FOUND", {
          message: "Agent not found",
        });
      }

      let sharedVia: string | null = null;

      if (!admin && agent.userId !== userId) {
        // Non-owner: check for an active share
        const share = await prisma.agentShare.findFirst({
          where: {
            agentId: input.agentId,
            userId,
            active: true,
          },
          select: { id: true },
        });

        if (!share) {
          throw new ORPCError("NOT_FOUND", {
            message: "Agent not found",
          });
        }

        sharedVia = share.id;
      }

      const conversation = await prisma.conversation.create({
        data: {
          userId,
          agentId: input.agentId,
          title: input.title ?? null,
          sharedVia,
        },
        select: conversationSelect,
      });

      return serializeConversation(conversation);
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().max(255),
      }),
    )
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;

      const conversation = await prisma.conversation.findUnique({
        where: { id: input.id },
        select: { userId: true },
      });

      if (!conversation || (!isAdmin(context) && conversation.userId !== userId)) {
        throw new ORPCError("NOT_FOUND", {
          message: "Conversation not found",
        });
      }

      const updated = await prisma.conversation.update({
        where: { id: input.id },
        data: { title: input.title },
        select: conversationSelect,
      });

      return serializeConversation(updated);
    }),

  delete: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;

      const conversation = await prisma.conversation.findUnique({
        where: { id: input.id },
        select: { userId: true },
      });

      if (!conversation || (!isAdmin(context) && conversation.userId !== userId)) {
        throw new ORPCError("NOT_FOUND", {
          message: "Conversation not found",
        });
      }

      await prisma.conversation.delete({
        where: { id: input.id },
      });

      return { success: true };
    }),

  markAsRead: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;

      const conversation = await prisma.conversation.findUnique({
        where: { id: input.id },
        select: { userId: true },
      });

      if (!conversation || (!isAdmin(context) && conversation.userId !== userId)) {
        throw new ORPCError("NOT_FOUND", {
          message: "Conversation not found",
        });
      }

      await prisma.conversation.update({
        where: { id: input.id },
        data: { readAt: new Date() },
      });

      return { success: true };
    }),

  search: protectedProcedure
    .input(
      z.object({
        query: z.string().min(1).max(500),
        agentId: z.string().optional(),
        dateFrom: z.string().datetime().optional(),
        dateTo: z.string().datetime().optional(),
        limit: z.number().min(1).max(50).optional(),
        cursor: z.string().optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      const limit = input.limit ?? 20;

      const messageWhere: Record<string, unknown> = {
        content: { contains: input.query, mode: "insensitive" },
        conversation: isAdmin(context) ? {} : { userId },
      };

      if (input.agentId) {
        (messageWhere.conversation as Record<string, unknown>).agentId =
          input.agentId;
      }

      const createdAtFilter: Record<string, unknown> = {};
      if (input.dateFrom) createdAtFilter.gte = new Date(input.dateFrom);
      if (input.dateTo) createdAtFilter.lte = new Date(input.dateTo);
      if (Object.keys(createdAtFilter).length > 0) {
        messageWhere.createdAt = createdAtFilter;
      }

      const messages = await prisma.message.findMany({
        where: messageWhere,
        select: {
          id: true,
          content: true,
          senderType: true,
          createdAt: true,
          conversation: {
            select: {
              id: true,
              title: true,
              agent: {
                select: {
                  slug: true,
                  name: true,
                  type: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit + 1,
        ...(input.cursor
          ? { cursor: { id: input.cursor }, skip: 1 }
          : {}),
      });

      const hasMore = messages.length > limit;
      const items = hasMore ? messages.slice(0, limit) : messages;

      return {
        items: items.map((msg) => {
          const conv = msg.conversation;
          const agent = conv.agent as Record<string, unknown>;
          return {
            id: msg.id,
            content:
              msg.content.length > 200
                ? msg.content.substring(0, 200) + "..."
                : msg.content,
            senderType: String(msg.senderType),
            createdAt: msg.createdAt,
            conversationId: conv.id,
            conversationTitle: conv.title,
            agentSlug: String(agent.slug),
            agentName: String(agent.name),
            agentType: String(agent.type),
          };
        }),
        nextCursor: hasMore ? items[items.length - 1]!.id : null,
      };
    }),

  exportBulk: protectedProcedure
    .input(
      z.object({
        agentId: z.string(),
        format: z.enum(["markdown", "json"]),
      }),
    )
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      const admin = isAdmin(context);

      // Verify the agent belongs to the user (admin can access any agent)
      const agent = await prisma.agent.findUnique({
        where: { id: input.agentId },
        select: { userId: true, slug: true, name: true },
      });

      if (!agent || (!admin && agent.userId !== userId)) {
        throw new ORPCError("NOT_FOUND", {
          message: "Agent not found",
        });
      }

      const conversations = await prisma.conversation.findMany({
        where: admin ? { agentId: input.agentId } : { userId, agentId: input.agentId },
        select: {
          id: true,
          title: true,
          createdAt: true,
          messages: {
            select: {
              content: true,
              senderType: true,
              createdAt: true,
            },
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: { updatedAt: "desc" },
      });

      if (input.format === "json") {
        return {
          agentSlug: agent.slug,
          agentName: agent.name,
          exportedAt: new Date().toISOString(),
          conversations: conversations.map((conv) => ({
            id: conv.id,
            title: conv.title,
            createdAt: conv.createdAt,
            messages: conv.messages.map((msg) => ({
              senderType: String(msg.senderType),
              content: msg.content,
              createdAt: msg.createdAt,
            })),
          })),
        };
      }

      // Markdown format
      const lines: string[] = [
        `# Conversations with ${agent.name} (${agent.slug})`,
        `Exported: ${new Date().toISOString()}`,
        "",
      ];

      for (const conv of conversations) {
        const title = conv.title || "Untitled conversation";
        lines.push(`## ${title}`);
        lines.push(
          `Started: ${conv.createdAt.toISOString()} | Messages: ${conv.messages.length}`,
        );
        lines.push("");

        for (const msg of conv.messages) {
          const sender = String(msg.senderType) === "user" ? "User" : "Agent";
          const time = msg.createdAt.toISOString();
          lines.push(`**${sender}** (${time}):`);
          lines.push(msg.content);
          lines.push("");
        }

        lines.push("---");
        lines.push("");
      }

      return { content: lines.join("\n"), agentSlug: agent.slug };
    }),
};

export const queuedMessagesRouter = {
  list: protectedProcedure
    .input(
      z.object({
        conversationId: z.string(),
      }),
    )
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;

      const conversation = await prisma.conversation.findUnique({
        where: { id: input.conversationId },
        select: { userId: true },
      });

      if (!conversation || (!isAdmin(context) && conversation.userId !== userId)) {
        throw new ORPCError("NOT_FOUND", {
          message: "Conversation not found",
        });
      }

      const items = await prisma.queuedMessage.findMany({
        where: { conversationId: input.conversationId },
        select: { id: true, content: true, position: true, createdAt: true },
        orderBy: { position: "asc" },
      });

      return items;
    }),

  create: protectedProcedure
    .input(
      z.object({
        conversationId: z.string(),
        content: z.string().min(1),
      }),
    )
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;

      const conversation = await prisma.conversation.findUnique({
        where: { id: input.conversationId },
        select: { userId: true },
      });

      if (!conversation || (!isAdmin(context) && conversation.userId !== userId)) {
        throw new ORPCError("NOT_FOUND", {
          message: "Conversation not found",
        });
      }

      // Get the max position for this conversation
      const last = await prisma.queuedMessage.findFirst({
        where: { conversationId: input.conversationId },
        orderBy: { position: "desc" },
        select: { position: true },
      });

      const item = await prisma.queuedMessage.create({
        data: {
          conversationId: input.conversationId,
          content: input.content,
          position: (last?.position ?? -1) + 1,
        },
        select: { id: true, content: true, position: true, createdAt: true },
      });

      return item;
    }),

  delete: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;

      const item = await prisma.queuedMessage.findUnique({
        where: { id: input.id },
        select: { conversation: { select: { userId: true } } },
      });

      if (!item || (!isAdmin(context) && item.conversation.userId !== userId)) {
        throw new ORPCError("NOT_FOUND", {
          message: "Queued message not found",
        });
      }

      await prisma.queuedMessage.delete({
        where: { id: input.id },
      });

      return { success: true };
    }),
};

export const messagesRouter = {
  list: protectedProcedure
    .input(
      z.object({
        conversationId: z.string(),
        cursor: z.string().optional(),
        limit: z.number().min(1).max(100).optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      const limit = input.limit ?? 50;

      // Verify the conversation belongs to the user
      const conversation = await prisma.conversation.findUnique({
        where: { id: input.conversationId },
        select: { userId: true },
      });

      if (!conversation || (!isAdmin(context) && conversation.userId !== userId)) {
        throw new ORPCError("NOT_FOUND", {
          message: "Conversation not found",
        });
      }

      const messages = await prisma.message.findMany({
        where: { conversationId: input.conversationId },
        select: {
          id: true,
          content: true,
          senderType: true,
          senderId: true,
          error: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: limit + 1,
        ...(input.cursor
          ? {
              cursor: { id: input.cursor },
              skip: 1,
            }
          : {}),
      });

      const hasMore = messages.length > limit;
      const items = hasMore ? messages.slice(0, limit) : messages;

      return {
        items: items.map((msg) => ({
          ...msg,
          senderType: String(msg.senderType),
        })),
        nextCursor: hasMore ? items[items.length - 1]!.id : null,
      };
    }),
};
