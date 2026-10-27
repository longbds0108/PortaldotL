"use client";

import { CheckCircle2, Loader2, Plus, XCircle } from "lucide-react";
import { useState } from "react";
import { numberToHex } from "viem";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/lang-provider";
import { tr } from "@/lib/i18n";
import { PORTALDOT_RPC_URL } from "@/lib/env";
import { chain } from "@/lib/wagmi";

type Eip1193 = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };

/** EIP-3085 parameters for PortaldotV3 Testnet (EVM values use 18 decimals). */
export const ADD_CHAIN_PARAMS = {
  chainId: numberToHex(chain.id),
  chainName: chain.name,
  nativeCurrency: chain.nativeCurrency,
  rpcUrls: [PORTALDOT_RPC_URL],
};

/**
 * Asks the browser wallet to add PortaldotV3 Testnet — or, if a network with this chain id already exists with an
 * outdated RPC (e.g. the retired feso-apps endpoint), to add the current RPC to it — then switch to it.
 * Works without connecting a wallet first.
 */
export async function addPortaldotToWallet(provider?: Eip1193): Promise<void> {
  const eth = provider ?? (globalThis as { ethereum?: Eip1193 }).ethereum;
  if (!eth)
    throw new Error(
      tr(
        "No browser wallet found. Install MetaMask (or another EVM wallet) and reload.",
        "Không tìm thấy ví trên trình duyệt. Hãy cài MetaMask (hoặc ví EVM khác) rồi tải lại trang.",
      ),
    );
  await eth.request({ method: "wallet_addEthereumChain", params: [ADD_CHAIN_PARAMS] });
  await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: ADD_CHAIN_PARAMS.chainId }] }).catch(() => {});
}

export function AddNetworkButton({ size = "sm", variant = "outline" }: { size?: "sm" | "default"; variant?: "outline" | "default" }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [error, setError] = useState<string>();
  const t = useT();
  return (
    <div className="space-y-2">
      <Button
        type="button"
        size={size}
        variant={variant}
        disabled={state === "busy"}
        onClick={async () => {
          setState("busy");
          setError(undefined);
          try {
            await addPortaldotToWallet();
            setState("done");
          } catch (e) {
            const err = e as { code?: number; message?: string };
            setError(
              err.code === 4001
                ? t("Request rejected in the wallet.", "Yêu cầu đã bị từ chối trong ví.")
                : err.message ?? t("The wallet could not add the network.", "Ví không thêm được mạng."),
            );
            setState("error");
          }
        }}
      >
        {state === "busy" ? <Loader2 className="animate-spin" /> : <Plus />}
        {t(`Add ${chain.name} to wallet`, `Thêm ${chain.name} vào ví`)}
      </Button>
      {state === "done" && (
        <p className="flex items-center gap-1.5 text-xs text-success-fg">
          <CheckCircle2 className="size-3.5" /> {t("Network ready in your wallet", "Mạng đã sẵn sàng trong ví")} ({PORTALDOT_RPC_URL}).
        </p>
      )}
      {state === "error" && (
        <p className="flex items-start gap-1.5 text-xs text-destructive">
          <XCircle className="mt-0.5 size-3.5 shrink-0" /> {error}
        </p>
      )}
    </div>
  );
}
