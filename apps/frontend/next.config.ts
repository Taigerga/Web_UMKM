import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Route `/login` dan `/register` sekarang ada, jadi `href` ke sana di
  // `ButtonLink` bisa divalidasi. Tanpa ini, typo seperti `/registerr` lolos
  // ke build dan baru muncul sebagai 404 saat diklik.
  typedRoutes: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
