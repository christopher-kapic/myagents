import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    CORS_ORIGIN: z.url().optional(),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    SSO_ENABLED: z.string().default("false"),
    SSO_CLIENT_ID: z.string().optional(),
    SSO_CLIENT_SECRET: z.string().optional(),
    SSO_ISSUER: z.string().optional(),
    SSO_PROVIDER_NAME: z.string().default("SSO"),
    FORCE_SSO: z.string().default("false"),
    VAPID_PUBLIC_KEY: z.string().optional(),
    VAPID_PRIVATE_KEY: z.string().optional(),
    VAPID_SUBJECT: z.string().default("mailto:admin@example.com"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
