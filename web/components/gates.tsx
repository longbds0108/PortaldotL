"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { AlertTriangle, Wallet } from "lucide-react";
import type { ReactNode } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { blindBidAddress } from "@/lib/contracts";
import { chain } from "@/lib/wagmi";

export function ConfigGate({ children }: { children: ReactNode }) {
  if (!blindBidAddress) {
    return (
      <div className="space-y-4">
        <Alert variant="info">
          <AlertTriangle />
          <div>
            <p className="font-medium">Preview mode</p>
            <p className="text-muted-foreground">
              This page is a visual preview. Sample tender details are illustrative; connect a contract and RPC later to load live data and enable transactions.
            </p>
          </div>
        </Alert>
        {children}
      </div>
    );
  }
  return <>{children}</>;
}

/** Requires a connected wallet on the configured chain before rendering children. */
export function WalletGate({ children, message = "Connect your wallet to continue." }: { children: ReactNode; message?: string }) {
  const { isConnected, chainId } = useAccount();
  const { switchChain, isPending } = useSwitchChain();

  if (!blindBidAddress) return <>{children}</>;

  if (!isConnected) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <Wallet className="size-8 text-muted-foreground" />
          <p className="text-muted-foreground">{message}</p>
          <ConnectButton />
        </CardContent>
      </Card>
    );
  }
  if (chainId !== chain.id) {
    return (
      <Alert variant="warning" className="items-center">
        <AlertTriangle />
        <span className="flex-1">Your wallet is on another network. Plinths runs on {chain.name}.</span>
        <Button size="sm" disabled={isPending} onClick={() => switchChain({ chainId: chain.id })}>
          Switch network
        </Button>
      </Alert>
    );
  }
  return <>{children}</>;
}
