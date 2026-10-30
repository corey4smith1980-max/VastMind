"use client";

import { useMemo, useState, type FormEvent } from "react";
import { AlertCircle, ArrowDownLeft, ArrowUpRight, Check, ExternalLink, LoaderCircle, LockKeyhole, ShieldCheck, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface CoinWalletViewProps {
  contractConfigured: boolean;
  walletAddress: string | null;
  balance: string | null;
  txHash: string | null;
  isConnecting: boolean;
  isSubmitting: boolean;
  error: string | null;
  status: string | null;
  onConnect(): void;
  onDisconnect(): void;
  onClaim(): void;
  onSend(recipient: string, amount: string): void;
}

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

export function CoinWalletView({
  contractConfigured,
  walletAddress,
  balance,
  txHash,
  isConnecting,
  isSubmitting,
  error,
  status,
  onConnect,
  onDisconnect,
  onClaim,
  onSend,
}: CoinWalletViewProps) {
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [validationError, setValidationError] = useState("");

  const connected = Boolean(walletAddress);
  const busy = isConnecting || isSubmitting;
  const amountIsValid = useMemo(() => {
    if (!amount.trim()) return false;
    const parsed = Number(amount);
    return Number.isFinite(parsed) && parsed > 0 && /^\d+(\.\d{1,18})?$/.test(amount.trim());
  }, [amount]);
  const addressIsValid = ADDRESS_PATTERN.test(recipient.trim());
  const formIsValid = addressIsValid && amountIsValid;

  const submitSend = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!addressIsValid) {
      setValidationError("Enter a valid Ethereum address beginning with 0x.");
      return;
    }
    if (!amountIsValid) {
      setValidationError("Enter an amount greater than zero, with up to 18 decimal places.");
      return;
    }
    setValidationError("");
    onSend(recipient.trim(), amount.trim());
  };

  const currentState = error
    ? { label: "Action needs attention", tone: "error" }
    : isConnecting
      ? { label: "Connecting wallet", tone: "working" }
      : isSubmitting
      ? { label: "Transaction in progress", tone: "working" }
      : txHash
        ? { label: "Transaction submitted", tone: "success" }
        : !contractConfigured
          ? { label: "Contract unavailable", tone: "warning" }
          : connected
            ? { label: "Wallet connected", tone: "success" }
            : { label: "Wallet not connected", tone: "neutral" };

  return (
    <section className="coin-wallet mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-10" aria-labelledby="coin-wallet-title">
      <header className="mb-7 flex flex-col gap-5 sm:mb-9 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-xl">
          <div className="mb-3 flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
              <WalletCards className="h-[18px] w-[18px]" aria-hidden="true" />
            </span>
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-primary">VastMind Coin</span>
          </div>
          <h1 id="coin-wallet-title" className="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-[2.65rem]">
            Your testnet wallet
          </h1>
          <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground sm:text-base">
            Explore token transfers on Sepolia. VMC here is testnet-only and has no monetary value.
          </p>
        </div>
        <div className={cn("inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em]", currentState.tone === "error" && "border-destructive/25 bg-destructive/5 text-destructive", currentState.tone === "success" && "border-online/25 bg-online/5 text-online", currentState.tone === "working" && "border-primary/25 bg-primary/5 text-primary", currentState.tone === "warning" && "border-amber-600/25 bg-amber-500/10 text-amber-800 dark:text-amber-300", currentState.tone === "neutral" && "border-border bg-muted/55 text-muted-foreground")}>
          <span className={cn("h-1.5 w-1.5 rounded-full", currentState.tone === "error" ? "bg-destructive" : currentState.tone === "working" ? "animate-pulse bg-primary" : currentState.tone === "success" ? "bg-online" : currentState.tone === "warning" ? "bg-amber-600" : "bg-muted-foreground")} />
          {currentState.label}
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
        <div className="space-y-5">
          <Card className="overflow-hidden border-primary/15 bg-card shadow-[0_20px_60px_-42px_hsl(var(--ink)/.45)]">
            <div className="relative isolate overflow-hidden bg-[hsl(var(--ink))] px-5 py-6 text-white sm:px-8 sm:py-8">
              <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-20 -z-10 h-64 w-64 rounded-full border border-white/10" />
              <div aria-hidden="true" className="pointer-events-none absolute -right-1 -top-11 -z-10 h-44 w-44 rounded-full border border-white/10" />
              <div aria-hidden="true" className="pointer-events-none absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-primary/15 to-transparent" />
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-white/55">Available balance</p>
                  <p className="mt-4 flex items-baseline gap-2">
                    <span className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">{connected ? balance ?? "—" : "—"}</span>
                    <span className="font-mono text-xs font-bold tracking-[0.12em] text-primary">VMC</span>
                  </p>
                  <p className="mt-2 text-xs text-white/55">{connected ? "Sepolia testnet balance" : "Connect a wallet to view your balance"}</p>
                </div>
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/[0.06] text-primary">
                  <span className="font-display text-xl font-bold">V</span>
                </span>
              </div>
              <div className="mt-8 flex flex-col gap-2 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/40">Connected wallet</p>
                  <p className="mt-1 truncate font-mono text-xs text-white/80">{walletAddress ?? "No wallet connected"}</p>
                </div>
                {connected ? (
                  <Button type="button" variant="outline" size="sm" onClick={onDisconnect} disabled={busy} className="min-h-9 border-white/15 bg-white/[0.06] text-white hover:bg-white/10">
                    Disconnect
                  </Button>
                ) : (
                  <Button type="button" size="sm" onClick={onConnect} disabled={isConnecting} className="min-h-9 shrink-0">
                    {isConnecting ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <WalletCards aria-hidden="true" />}
                    {isConnecting ? "Connecting…" : "Connect wallet"}
                  </Button>
                )}
              </div>
            </div>
            {!contractConfigured && (
              <div role="status" className="flex gap-3 border-t border-amber-600/15 bg-amber-500/[0.07] px-5 py-4 text-sm text-foreground sm:px-8">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden="true" />
                <p><span className="font-semibold">Sepolia contract not configured.</span> Deploy the test contract, then set <code className="font-mono text-xs">NEXT_PUBLIC_VASTMIND_COIN_TESTNET_ADDRESS</code> before token actions can work.</p>
              </div>
            )}
          </Card>

          {error && (
            <div role="alert" className="flex items-start gap-3 rounded-2xl border border-destructive/25 bg-destructive/[0.06] px-4 py-3.5 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <div><p className="font-semibold">Something went wrong</p><p className="mt-1 leading-5">{error}</p></div>
            </div>
          )}
          {status && !error && (
            <div role="status" aria-live="polite" className={cn("flex items-start gap-3 rounded-2xl border px-4 py-3.5 text-sm", txHash ? "border-online/20 bg-online/5 text-foreground" : "border-primary/20 bg-primary/[0.04] text-foreground")}>
              {isSubmitting ? <LoaderCircle className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" aria-hidden="true" /> : <Check className="mt-0.5 h-4 w-4 shrink-0 text-online" aria-hidden="true" />}
              <p className="leading-5">{status}</p>
            </div>
          )}
          {txHash && (
            <div className="rounded-2xl border border-online/20 bg-online/[0.045] px-4 py-3.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-foreground"><Check className="h-4 w-4 text-online" aria-hidden="true" /> Transaction reference</div>
              <p className="mt-2 break-all font-mono text-[11px] leading-5 text-muted-foreground">{txHash}</p>
              <a href={`https://sepolia.etherscan.io/tx/${encodeURIComponent(txHash)}`} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-primary underline-offset-4 hover:underline">
                View on Sepolia Etherscan <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
            </div>
          )}
        </div>

        <div className="space-y-5">
          <Card className="border-border/80 shadow-[0_16px_48px_-40px_hsl(var(--ink)/.4)]">
            <CardContent className="p-5 sm:p-6">
              <div className="mb-5 flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Send tokens</p>
                  <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">Transfer VMC</h2>
                </div>
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary"><ArrowUpRight className="h-4 w-4" aria-hidden="true" /></span>
              </div>
              <form onSubmit={submitSend} noValidate className="space-y-4">
                <div>
                  <label htmlFor="vmc-recipient" className="mb-1.5 block text-xs font-semibold">Recipient address</label>
                  <Input id="vmc-recipient" autoComplete="off" spellCheck={false} inputMode="text" placeholder="0x…" value={recipient} onChange={(event) => { setRecipient(event.target.value); setValidationError(""); }} aria-invalid={Boolean(validationError && !addressIsValid)} aria-describedby={validationError ? "vmc-form-error" : "vmc-address-help"} disabled={!connected || !contractConfigured || busy} className="h-11 font-mono text-xs" />
                  <p id="vmc-address-help" className="mt-1.5 text-[11px] leading-4 text-muted-foreground">Use an Ethereum-format address. Network checks happen when you submit.</p>
                </div>
                <div>
                  <label htmlFor="vmc-amount" className="mb-1.5 block text-xs font-semibold">Amount</label>
                  <div className="relative">
                    <Input id="vmc-amount" type="number" min="0" step="any" inputMode="decimal" placeholder="0.00" value={amount} onChange={(event) => { setAmount(event.target.value); setValidationError(""); }} aria-invalid={Boolean(validationError && !amountIsValid)} disabled={!connected || !contractConfigured || busy} className="h-11 pr-14 font-mono tabular-nums" />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center font-mono text-[10px] font-bold tracking-wide text-muted-foreground">VMC</span>
                  </div>
                </div>
                {validationError && <p id="vmc-form-error" role="alert" className="text-xs leading-5 text-destructive">{validationError}</p>}
                <Button type="submit" disabled={!connected || !contractConfigured || busy || !formIsValid} className="h-11 w-full rounded-xl">
                  {isSubmitting ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <ArrowUpRight aria-hidden="true" />}
                  {isSubmitting ? "Submitting transfer…" : "Send VMC"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="border-border/80 bg-[hsl(var(--accent)/.035)] shadow-none">
            <CardContent className="p-5 sm:p-6">
              <div className="flex gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent-foreground"><ArrowDownLeft className="h-4 w-4" aria-hidden="true" /></span>
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Test faucet</p>
                  <h2 className="mt-1 font-display text-lg font-semibold tracking-tight">Need test tokens?</h2>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">Request VMC for Sepolia testing only. This is not a purchase and tokens have no cash value.</p>
                  <Button type="button" variant="secondary" onClick={onClaim} disabled={!connected || !contractConfigured || busy} className="mt-4 w-full rounded-xl sm:w-auto">
                    {isSubmitting ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <ArrowDownLeft aria-hidden="true" />}
                    {isSubmitting ? "Request in progress…" : "Claim test VMC"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex items-start gap-3 px-1 text-xs leading-5 text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <p><span className="font-semibold text-foreground">Keep your wallet keys private.</span> VastMind never asks for or collects your seed phrase or private keys. Connect through your external wallet.</p>
          </div>
        </div>
      </div>

      <footer className="mt-7 flex flex-col gap-2 border-t border-border/70 pt-4 text-[10px] leading-5 text-muted-foreground sm:mt-9 sm:flex-row sm:items-center sm:justify-between">
        <span className="inline-flex items-center gap-1.5"><LockKeyhole className="h-3 w-3" aria-hidden="true" /> Sepolia testnet · ERC-20-compatible prototype</span>
        <span>Test tokens only. No real-money value, card purchase, cash-out, or investment.</span>
      </footer>
    </section>
  );
}
