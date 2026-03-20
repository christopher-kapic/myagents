import prisma from "@myagents/db";
import { env } from "@myagents/env/server";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin, twoFactor, genericOAuth } from "better-auth/plugins";

const ssoEnabled = env.SSO_ENABLED === "true";
const forceSso = env.FORCE_SSO === "true";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),

  trustedOrigins: [env.CORS_ORIGIN ?? env.BETTER_AUTH_URL],
  emailAndPassword: {
    enabled: !forceSso,
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
