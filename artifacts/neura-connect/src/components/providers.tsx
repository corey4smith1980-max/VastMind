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

// ---------- Clerk appearance: matches the porch-light switchboard palette ----------
const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "#e2502a",
    colorForeground: "#10262b",
    colorMutedForeground: "#4f6266",
    colorDanger: "#c1263f",
    colorBackground: "#fbf8f2",
    colorInput: "#fffdf9",
    colorInputForeground: "#10262b",
    colorNeutral: "#10262b",
    fontFamily: "var(--font-body), sans-serif",
    borderRadius: "0.85rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-[#fbf8f2] rounded-3xl w-[440px] max-w-full overflow-hidden shadow-[0_30px_80px_-30px_rgba(16,38,43,.45)] border border-[#e2d9ca]",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-[#10262b] font-display text-2xl",
    headerSubtitle: "text-[#4f6266]",
    socialButtonsBlockButtonText: "text-[#10262b] font-medium",
    formFieldLabel: "text-[#10262b] font-medium",
    footerActionLink: "text-[#e2502a] font-semibold hover:text-[#b83a1a]",
    footerActionText: "text-[#4f6266]",
    dividerText: "text-[#4f6266]",
    identityPreviewEditButton: "text-[#e2502a]",
    formFieldSuccessText: "text-[#1f7a4a]",
    alertText: "text-[#10262b]",
    logoBox: "h-12 justify-center",
    logoImage: "h-12 w-12",
    socialButtonsBlockButton: "bg-white border border-[#e2d9ca] hover:bg-[#f3ece0]",
    formButtonPrimary: "bg-[#e2502a] hover:bg-[#c9441f] text-[#fbf8f2] shadow-none",
    formFieldInput: "bg-[#fffdf9] border-[#d8cdbb] text-[#10262b]",
    footerAction: "bg-[#f3ece0] py-4",
    dividerLine: "bg-[#e2d9ca]",
    alert: "bg-[#fdebe4] border-[#f3c3b2]",
    otpCodeFieldInput: "border-[#d8cdbb] text-[#10262b]",
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
        signUp: { start: { title: "Join I AM", subtitle: "Your people, on one line — free to start" } },
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
