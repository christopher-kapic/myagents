import prisma from "@myagents/db";
import { env } from "@myagents/env/server";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin, twoFactor, genericOAuth } from "better-auth/plugins";
import nodemailer from "nodemailer";

const ssoEnabled = env.SSO_ENABLED === "true";
const forceSso = env.FORCE_SSO === "true";

function isSmtpConfigured(): boolean {
  return !!(env.SMTP_HOST && env.SMTP_PORT && env.SMTP_USER && env.SMTP_PASSWORD && env.SMTP_FROM);
}

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),

  trustedOrigins: [env.CORS_ORIGIN ?? env.BETTER_AUTH_URL],
  emailAndPassword: {
    enabled: !forceSso,
    ...(isSmtpConfigured()
      ? {
          sendResetPassword: async ({ user, url }) => {
            const transport = nodemailer.createTransport({
              host: env.SMTP_HOST,
              port: env.SMTP_PORT,
              secure: env.SMTP_PORT === 465,
              auth: {
                user: env.SMTP_USER,
                pass: env.SMTP_PASSWORD,
              },
            });
            void transport.sendMail({
              from: env.SMTP_FROM,
              to: user.email,
              subject: "Reset your password — MyAgents",
              html: `
                <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
                  <h2>Reset Your Password</h2>
                  <p>We received a request to reset your password. Click the button below to set a new one.</p>
                  <p>
                    <a href="${url}" style="display: inline-block; padding: 12px 24px; background: #18181b; color: #fff; text-decoration: none; border-radius: 6px;">
                      Reset Password
                    </a>
                  </p>
                  <p style="color: #71717a; font-size: 14px;">This link expires in 1 hour.</p>
                  <p style="color: #a1a1aa; font-size: 12px;">If you didn't request this, you can safely ignore this email.</p>
                </div>
              `,
            });
          },
        }
      : {}),
  },
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  advanced: {
    defaultCookieAttributes: {
      sameSite: "none",
      secure: true,
      httpOnly: true,
    },
  },
  plugins: [
    admin({
      defaultRole: "user",
    }),
    twoFactor({
      issuer: "MyAgents",
    }),
    ...(ssoEnabled && env.SSO_CLIENT_ID && env.SSO_CLIENT_SECRET && env.SSO_ISSUER
      ? [
          genericOAuth({
            config: [
              {
                providerId: "sso",
                discoveryUrl: `${env.SSO_ISSUER}/.well-known/openid-configuration`,
                clientId: env.SSO_CLIENT_ID,
                clientSecret: env.SSO_CLIENT_SECRET,
                scopes: ["openid", "profile", "email"],
              },
            ],
          }),
        ]
      : []),
  ],
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const count = await prisma.user.count();
          if (count === 0) {
            return {
              data: {
                ...user,
                role: "admin",
              },
            };
          }

          const signupsDisabled = await prisma.appSetting.findUnique({
            where: { key: "signupsDisabled" },
          });

          if (signupsDisabled?.value === "true") {
            const invitation = await prisma.invitation.findFirst({
              where: {
                email: user.email,
                acceptedAt: { not: null },
                revokedAt: null,
                expiresAt: { gt: new Date() },
              },
            });

            if (!invitation) {
              return false;
            }
          }

          return { data: user };
        },
      },
    },
  },
});
