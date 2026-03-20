import { ORPCError } from "@orpc/server";
import prisma from "@myagents/db";
import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";

import { adminProcedure, publicProcedure } from "../index";
import { isSmtpConfigured, sendInvitationEmail } from "../lib/email";

const INVITATION_EXPIRY_DAYS = 7;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function computeStatus(invitation: {
  acceptedAt: Date | null;
  revokedAt: Date | null;
  expiresAt: Date;
}): "accepted" | "revoked" | "expired" | "pending" {
  if (invitation.acceptedAt) return "accepted";
  if (invitation.revokedAt) return "revoked";
  if (invitation.expiresAt < new Date()) return "expired";
  return "pending";
}

export const invitationsRouter = {
  create: adminProcedure
    .input(z.object({ email: z.string().email() }))
    .handler(async ({ input, context }) => {
      if (!isSmtpConfigured()) {
        throw new ORPCError("BAD_REQUEST", {
          message: "SMTP is not configured",
        });
      }

      const existing = await prisma.invitation.findFirst({
        where: {
          email: input.email,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
      });

      if (existing) {
        throw new ORPCError("CONFLICT", {
          message: "A pending invitation already exists for this email",
        });
      }

      const token = randomBytes(32).toString("hex");
      const tokenHash = hashToken(token);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + INVITATION_EXPIRY_DAYS);

      const invitation = await prisma.invitation.create({
        data: {
          email: input.email,
          tokenHash,
          invitedBy: context.session.user.id,
          expiresAt,
        },
      });

      await sendInvitationEmail({
        to: input.email,
        inviterName: context.session.user.name,
        token,
      });

      return { id: invitation.id, email: invitation.email };
    }),

  list: adminProcedure.handler(async () => {
    const invitations = await prisma.invitation.findMany({
      include: { inviter: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    });

    return invitations.map((inv) => ({
      id: inv.id,
      email: inv.email,
      inviterName: inv.inviter.name,
      createdAt: inv.createdAt.toISOString(),
      expiresAt: inv.expiresAt.toISOString(),
      status: computeStatus(inv),
    }));
  }),

  revoke: adminProcedure
    .input(z.object({ id: z.string() }))
    .handler(async ({ input }) => {
      const invitation = await prisma.invitation.findUnique({
        where: { id: input.id },
      });

      if (!invitation) {
        throw new ORPCError("NOT_FOUND", { message: "Invitation not found" });
      }

      if (invitation.acceptedAt || invitation.revokedAt) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Invitation is no longer pending",
        });
      }

      await prisma.invitation.update({
        where: { id: input.id },
        data: { revokedAt: new Date() },
      });

      return { success: true };
    }),

  accept: publicProcedure
    .input(z.object({ token: z.string() }))
    .handler(async ({ input }) => {
      const tokenHash = hashToken(input.token);

      const invitation = await prisma.invitation.findUnique({
        where: { tokenHash },
      });

      if (!invitation) {
        return { valid: false, email: null };
      }

      if (invitation.revokedAt) {
        return { valid: false, email: null };
      }

      if (invitation.expiresAt < new Date()) {
        return { valid: false, email: null };
      }

      if (invitation.acceptedAt) {
        return { valid: true, email: invitation.email };
      }

      await prisma.invitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      });

      return { valid: true, email: invitation.email };
    }),
};
