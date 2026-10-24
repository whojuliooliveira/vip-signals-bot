import type { NextConfig } from "next";

const operationalOrigin = (process.env.OPERATIONAL_API_ORIGIN || "https://rupto-vip-signals-bot.jfduyb.easypanel.host").replace(/\/$/, "");

const nextConfig: NextConfig = {
  async rewrites() {
    if (!process.env.VERCEL) return [];
    return [{ source: "/api/:path*", destination: `${operationalOrigin}/api/:path*` }];
  },
};

export default nextConfig;
