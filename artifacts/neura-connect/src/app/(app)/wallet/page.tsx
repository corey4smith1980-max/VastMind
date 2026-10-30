"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BrowserProvider,
  Contract,
  formatUnits,
  getAddress,
  isAddress,
  parseUnits,
} from "ethers";
import VASTMIND_COIN_TESTNET_ABI from "@workspace/vastmind-token/abi";
import { CoinWalletView } from "@/components/wallet/coin-wallet-view";

const SEPOLIA_CHAIN_ID = 11155111n;
const tokenAddress = process.env.NEXT_PUBLIC_VASTMIND_COIN_TESTNET_ADDRESS?.trim() ?? "";

type Eip1193Provider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
};

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

function getInjectedProvider() {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("Open this page in a Sepolia-compatible wallet browser, such as MetaMask.");
  }
  return window.ethereum;
}

function makeBrowserProvider() {
  return new BrowserProvider(getInjectedProvider() as never, "any");
}

async function switchToSepolia(injected: Eip1193Provider) {
  const chain = await injected.request({ method: "eth_chainId" });
  if (typeof chain === "string" && BigInt(chain) === SEPOLIA_CHAIN_ID) return;

  try {
    await injected.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0xaa36a7" }],
    });
  } catch {
    throw new Error("Switch your wallet to Ethereum Sepolia, then try again.");
  }
}

function readableError(error: unknown) {
  const value = error as { code?: number | string; shortMessage?: string; reason?: string; message?: string };
  if (value.code === 4001 || value.code === "4001") return "The wallet request was declined.";
  return value.shortMessage ?? value.reason ?? value.message ?? "The wallet action failed. Try again.";
}

function displayUnits(raw: bigint) {
  const [whole, fraction = ""] = formatUnits(raw, 18).split(".");
  const trimmed = fraction.slice(0, 4).replace(/0+$/, "");
  return `${BigInt(whole).toLocaleString()}${trimmed ? `.${trimmed}` : ""}`;
}

export default function CoinWalletPage() {
  const contractConfigured = isAddress(tokenAddress);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const refreshBalance = useCallback(async (address: string) => {
    if (!contractConfigured) return;
    try {
      const provider = makeBrowserProvider();
      const network = await provider.getNetwork();
      if (network.chainId !== SEPOLIA_CHAIN_ID) {
        setBalance(null);
        setError("Switch your wallet to Ethereum Sepolia to view test tokens.");
        return;
      }
      const token = new Contract(tokenAddress, VASTMIND_COIN_TESTNET_ABI, provider);
      const rawBalance = await token.balanceOf(address) as bigint;
      setBalance(displayUnits(rawBalance));
      setError(null);
    } catch (cause) {
      setError(readableError(cause));
    }
  }, [contractConfigured]);

  useEffect(() => {
    if (walletAddress) void refreshBalance(walletAddress);
  }, [walletAddress, refreshBalance]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.ethereum?.on) return;
    const injected = window.ethereum;
    const onAccountsChanged = (...args: unknown[]) => {
      const accounts = Array.isArray(args[0]) ? args[0] as string[] : [];
      setWalletAddress(accounts[0] && isAddress(accounts[0]) ? getAddress(accounts[0]) : null);
      setBalance(null);
      setTxHash(null);
      setError(null);
      setStatus(null);
    };
    const onChainChanged = () => {
      setBalance(null);
      setTxHash(null);
      setStatus("Network changed. Checking the Sepolia wallet state.");
      if (walletAddress) void refreshBalance(walletAddress);
    };
    injected.on("accountsChanged", onAccountsChanged);
    injected.on("chainChanged", onChainChanged);
    return () => {
      injected.removeListener?.("accountsChanged", onAccountsChanged);
      injected.removeListener?.("chainChanged", onChainChanged);
    };
  }, [walletAddress, refreshBalance]);

  const connectWallet = async () => {
    setIsConnecting(true);
    setError(null);
    setStatus(null);
    try {
      const injected = getInjectedProvider();
      await injected.request({ method: "eth_requestAccounts" });
      await switchToSepolia(injected);
      const signer = await makeBrowserProvider().getSigner();
      const address = getAddress(await signer.getAddress());
      setWalletAddress(address);
      if (contractConfigured) {
        await refreshBalance(address);
        setStatus("Wallet connected to Ethereum Sepolia.");
      } else {
        setStatus("Wallet connected. Configure the testnet contract address to enable token actions.");
      }
    } catch (cause) {
      setError(readableError(cause));
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnectWallet = () => {
    setWalletAddress(null);
    setBalance(null);
    setTxHash(null);
    setError(null);
    setStatus("VastMind has cleared this wallet from the page.");
  };

  const submitTransaction = async (action: "claim" | "send", recipient?: string, amount?: string) => {
    if (!contractConfigured) {
      setError("The Sepolia token contract has not been configured yet.");
      return;
    }
    if (!walletAddress) {
      setError("Connect an external wallet first.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setStatus(null);
    setTxHash(null);
    try {
      const provider = makeBrowserProvider();
      await switchToSepolia(getInjectedProvider());
      const signer = await provider.getSigner();
      const token = new Contract(tokenAddress, VASTMIND_COIN_TESTNET_ABI, signer);
      const transaction = action === "claim"
        ? await token.claimTestTokens()
        : await token.transfer(getAddress(recipient!), parseUnits(amount!, 18));
      setTxHash(transaction.hash);
      setStatus("Transaction submitted. Waiting for Sepolia confirmation.");
      await transaction.wait();
      setStatus(action === "claim" ? "Test tokens claimed on Sepolia." : "Transfer confirmed on Sepolia.");
      await refreshBalance(walletAddress);
    } catch (cause) {
      setError(readableError(cause));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <CoinWalletView
      contractConfigured={contractConfigured}
      walletAddress={walletAddress}
      balance={balance}
      txHash={txHash}
      isConnecting={isConnecting}
      isSubmitting={isSubmitting}
      error={error}
      status={status}
      onConnect={() => void connectWallet()}
      onDisconnect={disconnectWallet}
      onClaim={() => void submitTransaction("claim")}
      onSend={(recipient, amount) => void submitTransaction("send", recipient, amount)}
    />
  );
}
