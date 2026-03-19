import prisma from "@myagents/db";
import { z } from "zod";

import { protectedProcedure } from "../index";

function isAdmin(context: { session: { user: { role?: string | null } } }): boolean {
  return context.session.user.role === "admin";
}

export const healthRouter = {
  /**
   * Get health overview for all user's agents (admin sees all agents).
   * Returns each agent with status, last seen, and uptime percentage.
   */
  overview: protectedProcedure.handler(async ({ context }) => {
    const userId = context.session.user.id;
    const admin = isAdmin(context);

    const agents = await prisma.agent.findMany({
      where: admin ? {} : { userId },
      select: {
        id: true,
        slug: true,
        name: true,
        type: true,
        status: true,
        node: { select: { id: true, name: true, status: true, lastSeen: true } },
      },
      orderBy: { name: "asc" },
    });

    // Calculate uptime for each agent over the last 24 hours
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const agentHealthPromises = agents.map(async (agent) => {
      const uptimePercent = await calculateUptimePercent(
        agent.id,
        String(agent.status),
        oneDayAgo,
        now,
      );

      return {
        id: agent.id,
        slug: agent.slug,
        name: agent.name,
        type: String(agent.type),
        status: String(agent.status),
        lastSeen: agent.node?.lastSeen?.toISOString() ?? null,
        nodeName: agent.node?.name ?? null,
        nodeStatus: agent.node ? String(agent.node.status) : null,
        uptimePercent24h: uptimePercent,
      };
    });

    const agentHealth = await Promise.all(agentHealthPromises);

    // Summary stats
    const totalAgents = agentHealth.length;
    const onlineCount = agentHealth.filter((a) => a.status === "online").length;
    const offlineCount = totalAgents - onlineCount;
    const avgUptime =
      totalAgents > 0
        ? agentHealth.reduce((sum, a) => sum + a.uptimePercent24h, 0) /
          totalAgents
        : 0;

    return {
      summary: {
        totalAgents,
        onlineCount,
        offlineCount,
        avgUptime24h: Math.round(avgUptime * 100) / 100,
      },
      agents: agentHealth,
    };
  }),

  /**
   * Get detailed health info for a specific agent including status history.
   */
  agentDetail: protectedProcedure
    .input(
      z.object({
        agentId: z.string(),
        days: z.number().min(1).max(90).default(7),
      }),
    )
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;

      const admin = isAdmin(context);

      const agent = await prisma.agent.findFirst({
        where: admin ? { id: input.agentId } : { id: input.agentId, userId },
        select: {
          id: true,
          slug: true,
          name: true,
          type: true,
          status: true,
          node: {
            select: { id: true, name: true, status: true, lastSeen: true },
          },
        },
      });

      if (!agent) {
        throw new Error("Agent not found");
      }

      const now = new Date();
      const startDate = new Date(
        now.getTime() - input.days * 24 * 60 * 60 * 1000,
      );

      // Get status change history
      const logs = await prisma.agentUptimeLog.findMany({
        where: {
          agentId: input.agentId,
          timestamp: { gte: startDate },
        },
        orderBy: { timestamp: "desc" },
        take: 200,
      });

      const uptimePercent = await calculateUptimePercent(
        input.agentId,
        String(agent.status),
        startDate,
        now,
      );

      return {
        id: agent.id,
        slug: agent.slug,
        name: agent.name,
        type: String(agent.type),
        status: String(agent.status),
        lastSeen: agent.node?.lastSeen?.toISOString() ?? null,
        nodeName: agent.node?.name ?? null,
        uptimePercent: Math.round(uptimePercent * 100) / 100,
        statusHistory: logs.map((log) => ({
          status: String(log.status),
          timestamp: log.timestamp.toISOString(),
        })),
      };
    }),
};

/**
 * Calculate the uptime percentage for an agent over a time period.
 * Uses the uptime logs to determine how long the agent was online.
 */
async function calculateUptimePercent(
  agentId: string,
  currentStatus: string,
  startDate: Date,
  endDate: Date,
): Promise<number> {
  const totalMs = endDate.getTime() - startDate.getTime();
  if (totalMs <= 0) return 0;

  // Get all status changes in the period, ordered by time
  const logs = await prisma.agentUptimeLog.findMany({
    where: {
      agentId,
      timestamp: { gte: startDate, lte: endDate },
    },
    orderBy: { timestamp: "asc" },
    select: { status: true, timestamp: true },
  });

  // Also get the last log before the period to know the starting state
  const lastLogBefore = await prisma.agentUptimeLog.findFirst({
    where: {
      agentId,
      timestamp: { lt: startDate },
    },
    orderBy: { timestamp: "desc" },
    select: { status: true },
  });

  // If no logs at all, assume current status for the entire period
  if (logs.length === 0 && !lastLogBefore) {
    return currentStatus === "online" ? 100 : 0;
  }

  // Determine starting status at the beginning of the period
  let statusAtStart = lastLogBefore ? String(lastLogBefore.status) : "offline";

  let onlineMs = 0;
  let lastTime = startDate.getTime();
  let lastStatus = statusAtStart;

  for (const log of logs) {
    const logTime = log.timestamp.getTime();
    if (lastStatus === "online") {
      onlineMs += logTime - lastTime;
    }
    lastTime = logTime;
    lastStatus = String(log.status);
  }

  // Account for time from last log to end of period.
  // Use currentStatus for the trailing period since it reflects the agent's
  // actual state right now. If a transition log was lost (fire-and-forget
  // failure or race condition), this prevents showing 0% for a connected agent.
  if (currentStatus === "online") {
    onlineMs += endDate.getTime() - lastTime;
  }

  return Math.min(100, (onlineMs / totalMs) * 100);
}
