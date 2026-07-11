import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // PDF-Bibliotheken laufen serverseitig in Node und dürfen nicht gebündelt werden
  serverExternalPackages: ["@react-pdf/renderer"],
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
};

export default nextConfig;
