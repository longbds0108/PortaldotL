"use client";

import { useConnectModal } from "@rainbow-me/rainbowkit";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { addPortaldotToWallet } from "@/components/add-network-button";
import { useT } from "@/components/lang-provider";
import { IS_LOCAL_CHAIN, NETWORK_NAME } from "@/lib/network";
import { cn } from "@/lib/utils";
import { chain } from "@/lib/wagmi";

/**
 * Network pill next to the balance. Clicking asks the wallet to add PortaldotV3 Testnet — or to add the current RPC to
 * an existing network with this chain id (e.g. one still on the retired feso-apps RPC) — and switch to it.
 * Disconnected, it opens the connect modal instead.
 */
export function NetworkChip() {
  const { isConnected, chainId, connector } = useAccount();
  const { switchChain, isPending } = useSwitchChain();
  const { openConnectModal } = useConnectModal();
  const [failed, setFailed] = useState(false);
  const t = useT();
  useEffect(() => {
    if (!failed) return;
    const timer = setTimeout(() => setFailed(false), 2500);
    return () => clearTimeout(timer);
  }, [failed]);

  const onPortaldotV3 = isConnected && chainId === chain.id;
  const status = !isConnected ? "idle" : onPortaldotV3 ? "ok" : "wrong";
  const title = failed
    ? t("The wallet did not switch network", "Ví chưa chuyển mạng")
    : status === "ok"
      ? t(`Wallet is on ${NETWORK_NAME}`, `Ví đang ở ${NETWORK_NAME}`)
      : status === "wrong"
        ? t(`Add / switch wallet to ${NETWORK_NAME}`, `Thêm / chuyển ví sang ${NETWORK_NAME}`)
        : t("Connect a wallet", "Kết nối ví");

  return (
    <button
      type="button"
      title={title}
      aria-label={`${NETWORK_NAME}: ${title}`}
      disabled={isPending}
      onClick={async () => {
        if (!isConnected) return openConnectModal?.();
        const provider = (await connector?.getProvider?.().catch(() => undefined)) as Parameters<typeof addPortaldotToWallet>[0];
        // Add (or refresh the RPC of) the network first, then switch; fall back to wagmi's switch.
        const added = await addPortaldotToWallet(provider).then(() => true, () => false);
        if (!added) switchChain({ chainId: chain.id }, { onError: () => setFailed(true) });
      }}
      className={cn(
        "flex h-10 shrink-0 items-center gap-2 rounded-full border border-border bg-card/80 px-2.5 text-[0.8rem] font-medium text-foreground transition-colors duration-200 hover:border-ring disabled:cursor-progress sm:pl-2.5 sm:pr-3.5",
        status === "wrong" && "border-[color-mix(in_srgb,var(--warning)_45%,transparent)] text-warning-fg",
        failed && "border-[color-mix(in_srgb,var(--destructive)_45%,transparent)] text-destructive-fg",
        IS_LOCAL_CHAIN && "text-warning-fg",
      )}
    >
      <span className="relative grid size-5 shrink-0 place-items-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- small static logo */}
        <img src="/brand/portaldot-v3.jpg" alt="" width={20} height={20} className={cn("size-5 rounded-full", isPending && "opacity-40")} />
        {isPending ? (
          <Loader2 className="absolute size-3.5 animate-spin text-foreground" aria-hidden="true" />
        ) : (
          // Status badge: on PortaldotV3 / other network / not connected (or a rejected switch).
          <i
            aria-hidden="true"
            className={cn(
              "absolute -bottom-0.5 -right-0.5 size-2 rounded-full ring-2 ring-[var(--header-solid)]",
              failed ? "bg-destructive" : status === "ok" ? "bg-success" : status === "wrong" ? "bg-warning" : "bg-muted-foreground",
            )}
          />
        )}
      </span>
      <span className="hidden whitespace-nowrap sm:inline">{NETWORK_NAME}</span>
    </button>
  );
}
