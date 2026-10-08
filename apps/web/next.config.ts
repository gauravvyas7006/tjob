import type { NextConfig } from "next";

// `npm run dev:local`: use an embedded local Postgres instead of Neon (development only).
const localDb = process.env.TJOB_PGLITE === "1";

const nextConfig: NextConfig = {
  // Native/CommonJS-heavy mail libraries run as plain Node modules instead of being bundled.
  // (@react-pdf/renderer is already on Next's default external list.)
  serverExternalPackages: ["imapflow", "mailparser", "nodemailer", ...(localDb ? ["pg"] : [])],
  experimental: {
    // CV PDF uploads go through a Server Action; Vercel caps request bodies at 4.5 MB.
    serverActions: { bodySizeLimit: "4mb" },
  },
  turbopack: {
    ...(localDb ? { resolveAlias: { "@/db": "./src/db/local.ts" } } : {}),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
