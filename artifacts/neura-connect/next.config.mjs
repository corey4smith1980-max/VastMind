// Next.js config for VastMind's root-mounted web app.
// Only the Clerk *publishable* key and proxy URL are exposed to the browser.
const basePath = (process.env.BASE_PATH ?? "").replace(/\/$/, "");

/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath,
  // Keep a trailing slash on web routes. The web app is mounted at the root;
  // artifact routing sends the mobile install page to /mobile/ instead.
  trailingSlash: true,
  reactStrictMode: true,
  // Clerk's development handshake uses sensitive URL parameters.
  logging: { incomingRequests: false },
  allowedDevOrigins: ["127.0.0.1", "localhost", "*.replit.dev", "*.repl.co", "*.replit.app", "*.pike.replit.dev", "*.picard.replit.dev", "*.kirk.replit.dev", "*.janeway.replit.dev", "*.riker.replit.dev", "*.worf.replit.dev", "*.spock.replit.dev"],
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
