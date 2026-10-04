import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // self-contained server for the Docker image (see Dockerfile)
  output: "standalone",
  // The sidebar owns the bottom-left corner.
  devIndicators: { position: "bottom-right" },
};

export default nextConfig;
