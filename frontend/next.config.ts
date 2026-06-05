import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 產出自帶最小 runtime 的 standalone 版（Docker image 用 .next/standalone）。
  output: "standalone",
};

export default nextConfig;
