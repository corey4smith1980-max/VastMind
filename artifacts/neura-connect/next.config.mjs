// Next.js config for NeuraCoreConnect.
// Only the Clerk *publishable* key and proxy URL are exposed to the browser.
const basePath = (process.env.BASE_PATH || "/neura-connect").replace(/\/$/, "");

/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath,
  reactStrictMode: true,
  // Clerk's development handshake uses sensitive URL parameters.
  logging: { incomingRequests: false },
  allowedDevOrigins: ["*.replit.dev", "*.repl.co", "*.replit.app", "*.pike.replit.dev", "*.picard.replit.dev", "*.kirk.replit.dev", "*.janeway.replit.dev", "*.riker.replit.dev", "*.worf.replit.dev", "*.spock.replit.dev"],
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
      process.env.VITE_CLERK_PUBLISHABLE_KEY || process.env.CLERK_PUBLISHABLE_KEY || "",
    NEXT_PUBLIC_CLERK_PROXY_URL:
      process.env.VITE_CLERK_PROXY_URL || process.env.CLERK_PROXY_URL || "",
  },
  transpilePackages: ["@workspace/api-client-react"],
};

export default nextConfig;
