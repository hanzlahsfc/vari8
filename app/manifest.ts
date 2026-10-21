import type { MetadataRoute } from "next";

// PR-31: installable PWA surface only. `display: "standalone"` promises an
// app-like window; it does NOT promise offline support, and no service
// worker ships here. Colors are the pro-dark theme tokens
// (themes/pro-dark.css): base #191919, accent #e34332.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Vari8",
    short_name: "Vari8",
    description: "Coaching workspace for programs, check ins and progress.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#191919",
    theme_color: "#191919",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icons/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
