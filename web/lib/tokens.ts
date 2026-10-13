"use client";

import { erc20Abi, type Address } from "viem";
import { useReadContracts } from "wagmi";
import { chain } from "./wagmi";

/**
 * Arc Testnet token contracts, from docs.arc.io/arc/references/contract-addresses.md (checked on-chain).
 * USDC's ERC-20 interface (6 decimals) reads the same balance as native USDC (18 decimals, gas).
 * Decimals are read from each contract, as the docs recommend, rather than hardcoded.
 */
export const TOKENS: { symbol: string; name: string; address: Address; logo: string; note?: string }[] = [
  { symbol: "USDC", name: "USD Coin", address: "0x3600000000000000000000000000000000000000", logo: "/tokens/usdc.png", note: "Also pays gas" },
  { symbol: "EURC", name: "Euro Coin", address: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a", logo: "/tokens/eurc.png" },
  { symbol: "cirBTC", name: "Circle Wrapped Bitcoin", address: "0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF", logo: "/tokens/cirbtc.png" },
];

export type TokenBalance = (typeof TOKENS)[number] & { value?: bigint; decimals?: number; error: boolean };

/** balanceOf + decimals for every token in one multicall, refreshed like the rest of the app. */
export function useTokenBalances(owner: Address | undefined, enabled = true) {
  const res = useReadContracts({
    contracts: TOKENS.flatMap((t) => [
      { address: t.address, abi: erc20Abi, functionName: "balanceOf", args: [owner!], chainId: chain.id } as const,
      { address: t.address, abi: erc20Abi, functionName: "decimals", chainId: chain.id } as const,
    ]),
    query: { enabled: enabled && !!owner, refetchInterval: 15_000 },
  });
  const balances: TokenBalance[] = TOKENS.map((t, i) => {
    const bal = res.data?.[2 * i];
    const dec = res.data?.[2 * i + 1];
    const ok = bal?.status === "success" && dec?.status === "success";
    return {
      ...t,
      value: ok ? (bal.result as bigint) : undefined,
      decimals: ok ? Number(dec.result) : undefined,
      error: res.isError || bal?.status === "failure" || dec?.status === "failure",
    };
  });
  return { balances, isLoading: res.isLoading, refetch: res.refetch };
}
