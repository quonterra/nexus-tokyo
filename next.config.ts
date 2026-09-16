import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The LP is a static page at public/index.html
  async rewrites() {
    return {
      beforeFiles: [{ source: "/", destination: "/index.html" }],
    };
  },
};

export default nextConfig;
