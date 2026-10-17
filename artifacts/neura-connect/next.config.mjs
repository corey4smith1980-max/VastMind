// Next.js config for I AM.
// Only the Clerk *publishable* key and proxy URL are exposed to the browser.
const basePath = (process.env.BASE_PATH || "/neura-connect").replace(/\/$/, "");

/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath,
  // The artifact is mounted at /neura-connect/ and its startup probe uses that
  // exact URL. Keep Next's canonical URL consistent instead of redirecting
  // back to the slashless mount point during the production health check.
  trailingSlash: true,
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
