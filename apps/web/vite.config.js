import { writeFileSync } from "node:fs";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const buildVersion = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** Writes version.json to dist/ after build so the client can detect new deployments. */
function versionPlugin() {
    return {
        name: "version-json",
        closeBundle() {
            writeFileSync(
                path.resolve(__dirname, "dist/version.json"),
                JSON.stringify({ version: buildVersion }),
            );
        },
    };
}

export default defineConfig({
    build: {
        rollupOptions: {
            output: {
                manualChunks: {
                    "react-vendor": [
                        "react",
                        "react/jsx-runtime",
                        "react-dom",
                        "react-dom/client",
                    ],
                    tanstack: [
                        "@tanstack/react-router",
                        "@tanstack/react-query",
                        "@tanstack/react-form",
                    ],
                    ui: ["lucide-react", "sonner", "next-themes"],
                    markdown: ["react-markdown", "remark-gfm"],
                    orpc: [
                        "@orpc/client",
                        "@orpc/server",
                        "@orpc/tanstack-query",
                    ],
                    auth: ["better-auth"],
                    zod: ["zod"],
                },
            },
        },
    },
    plugins: [
        tailwindcss(),
        tanstackRouter({}),
        react(),
        VitePWA({
            strategies: "injectManifest",
            srcDir: "src",
            filename: "sw.ts",
            registerType: "autoUpdate",
            manifest: {
                name: "MyAgents",
                short_name: "MyAgents",
                description: "MyAgents - AI Agent Fleet Management",
                theme_color: "#0c0c0c",
                background_color: "#0c0c0c",
            },
            pwaAssets: { disabled: false, config: true },
            devOptions: { enabled: true },
            injectManifest: {
                globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
                maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
            },
        }),
        versionPlugin(),
    ],
    define: {
        __APP_VERSION__: JSON.stringify(buildVersion),
    },
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
    server: {
        port: 3001,
    },
});
