"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ClerkProvider, useClerk } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RealtimeProvider } from "@/lib/realtime";
import { basePath, stripBase } from "@/lib/base";

// REQUIRED — resolves the key from window.location.hostname so the same build
// serves multiple Clerk custom domains.
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
);

// REQUIRED — empty in dev (Clerk hits dev FAPI directly), auto-set in prod.
const clerkProxyUrl = process.env.NEXT_PUBLIC_CLERK_PROXY_URL;

if (!clerkPubKey) {
  throw new Error("Missing Clerk publishable key");
}

// ---------- Clerk appearance: matches the VastMind neon navy brand ----------
const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/vastmind-wordmark.png`,
  },
  variables: {
    colorPrimary: "#2563eb",
    colorForeground: "#15182f",
    colorMutedForeground: "#626983",
    colorDanger: "#c12653",
    colorBackground: "#f7f8ff",
    colorInput: "#ffffff",
    colorInputForeground: "#15182f",
    colorNeutral: "#15182f",
    fontFamily: "var(--font-body), sans-serif",
    borderRadius: "0.85rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-[#f7f8ff] rounded-3xl w-[440px] max-w-full overflow-hidden shadow-[0_30px_80px_-30px_rgba(12,19,55,.35)] border border-[#e0e5f2]",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-[#15182f] font-display text-2xl",
    headerSubtitle: "text-[#626983]",
    socialButtonsBlockButtonText: "text-[#15182f] font-medium",
    formFieldLabel: "text-[#15182f] font-medium",
    footerActionLink: "text-[#2563eb] font-semibold hover:text-[#1748be]",
    footerActionText: "text-[#626983]",
    dividerText: "text-[#626983]",
    identityPreviewEditButton: "text-[#2563eb]",
    formFieldSuccessText: "text-[#1f7a4a]",
    alertText: "text-[#15182f]",
    logoBox: "h-12 justify-center",
    logoImage: "h-12 w-12",
    socialButtonsBlockButton: "bg-white border border-[#e0e5f2] hover:bg-[#eef1ff]",
    formButtonPrimary: "bg-[#2563eb] hover:bg-[#1748be] text-white shadow-none",
    formFieldInput: "bg-white border-[#d8deed] text-[#15182f]",
    footerAction: "bg-[#eef1fa] py-4",
    dividerLine: "bg-[#e0e5f2]",
    alert: "bg-[#fff0f4] border-[#f4c2d0]",
    otpCodeFieldInput: "border-[#d8deed] text-[#15182f]",
    formFieldRow: "gap-2",
    main: "gap-5",
  },
};

// Clears every cached query when the signed-in user changes (sign in/out/switch).
function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        queryClient.clear();
      }
      // Prevent a shared device from retaining the previous account's push
      // subscription after sign-out or an account switch. Closing a tab does
      // not unsubscribe: that is exactly when background push is needed.
      if(typeof navigator!=="undefined"&&"serviceWorker" in navigator) {
        const owner=localStorage.getItem("neura-push-owner");
        if(owner&&owner!==userId) {
          localStorage.removeItem("neura-push-owner");
          navigator.serviceWorker.getRegistration(`${basePath}/`).then(async r=>{
            const sub=await r?.pushManager.getSubscription();await sub?.unsubscribe();
          }).catch(()=>{});
        }
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, queryClient]);

  return null;
}

export default function Providers({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 10_000, retry: 1, refetchOnWindowFocus: true } } }),
  );

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: { start: { title: "Pick up the line", subtitle: "Sign in to your chats, circles and channels" } },
        signUp: { start: { title: "Join VastMind", subtitle: "Your people, on one line — free to start" } },
      }}
      routerPush={(to) => router.push(stripBase(to))}
      routerReplace={(to) => router.replace(stripBase(to))}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem storageKey="ncc-theme">
          <TooltipProvider delayDuration={250}>
            <RealtimeProvider>{children}</RealtimeProvider>
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}
