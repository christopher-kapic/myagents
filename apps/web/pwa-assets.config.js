import { defineConfig, minimal2023Preset as preset } from "@vite-pwa/assets-generator/config";
export default defineConfig({
    headLinkOptions: {
        preset: "2023",
    },
    preset: {
        ...preset,
        // No padding — icons are pre-composed with full-bleed artwork
        transparent: { ...preset.transparent, padding: 0 },
        maskable: { ...preset.maskable, padding: 0, resizeOptions: { fit: "cover", background: "transparent" } },
        apple: { ...preset.apple, padding: 0, resizeOptions: { fit: "cover", background: "transparent" } },
    },
    images: ["public/logo.png"],
});
