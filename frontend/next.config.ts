import type { NextConfig } from "next";

const BACKEND = process.env.API_INTERNAL_URL || "http://localhost:8000";

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    return [
      // 所有 /api/** 直接透傳到 Python 後端（含 /api/login、/api/chat、/api/answer）
      { source: "/api/:path*", destination: `${BACKEND}/api/:path*` },
    ];
  },
};

export default nextConfig;
