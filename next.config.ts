import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // PDF-Bibliotheken laufen serverseitig in Node und dürfen nicht gebündelt werden
  serverExternalPackages: ["@react-pdf/renderer"],
  experimental: {
    serverActions: {
      // Etwas Puffer über dem 20-MB-Dateilimit (Multipart-Overhead), damit
      // knapp darunter liegende Dateien nicht am Body-Limit scheitern
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
