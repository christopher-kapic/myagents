import { env } from "@myagents/env/web";
import { createAuthClient } from "better-auth/react";
import { adminClient, twoFactorClient, genericOAuthClient } from "better-auth/client/plugins";
export const authClient = createAuthClient({
    baseURL: env.VITE_SERVER_URL ?? window.location.origin,
    plugins: [adminClient(), twoFactorClient(), genericOAuthClient()],
});
