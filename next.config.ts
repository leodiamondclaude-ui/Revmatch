import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: { remotePatterns: [{ protocol: "https", hostname: "**.supabase.co" }] },
  experimental: { serverActions: { bodySizeLimit: "25mb" } },
};

export default nextConfig;
