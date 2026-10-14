import { parseUnits } from "viem";

/** Native tPOTv3 precision on PortaldotV3 Testnet. */
export const TOKEN_DECIMALS = 14;

/** Exact bigint formatting (no float rounding): rounds half-up to cents, adds thousands separators. */
function formatUnits(value: bigint, decimals: number): string {
  const scale = 10n ** BigInt(decimals - 2);
  const cents = (value + scale / 2n) / scale;
  const dollars = cents / 100n;
  return `${dollars.toLocaleString("en-US")}.${(cents % 100n).toString().padStart(2, "0")}`;
}

/** Format token base units as a tPOTv3 quantity. */
export function formatTokenAmount(amount: bigint): string {
  return `${formatUnits(amount, TOKEN_DECIMALS)} tPOTv3`;
}

/** Wallet balances: rounded DOWN to 2 decimals so the UI never shows more than the wallet holds. */
export function formatNativeAmountFloor(valueWei: bigint): string {
  const cents = valueWei / 10n ** BigInt(TOKEN_DECIMALS - 2);
  return `${(cents / 100n).toLocaleString("en-US")}.${(cents % 100n).toString().padStart(2, "0")} tPOTv3`;
}

/** Native base units formatted as a tPOTv3 quantity. */
export function formatNativeAmount(valueWei: bigint): string {
  return `${formatUnits(valueWei, TOKEN_DECIMALS)} tPOTv3`;
}

export function formatBudget(minAmount: bigint, maxAmount: bigint): string {
  return minAmount === maxAmount ? formatTokenAmount(minAmount) : `${formatUnits(minAmount, TOKEN_DECIMALS)}–${formatUnits(maxAmount, TOKEN_DECIMALS)} tPOTv3`;
}

/** User input like "7,500.5" → 14-decimal bigint. Throws on invalid input. */
export function parseTokenAmount(input: string): bigint {
  return parseUnits(normalizeAmountInput(input), TOKEN_DECIMALS);
}

export function parseNativeAmount(input: string): bigint {
  return parseUnits(normalizeAmountInput(input), TOKEN_DECIMALS);
}

export function normalizeAmountInput(input: string): string {
  const v = input.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d+)?$/.test(v)) throw new Error("Enter a positive number");
  return v;
}

export function isValidAmountInput(input: string, decimals = TOKEN_DECIMALS): boolean {
  try {
    const v = normalizeAmountInput(input);
    return (v.split(".")[1]?.length ?? 0) <= decimals;
  } catch {
    return false;
  }
}

export function shortAddress(addr?: string): string {
  return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "";
}

export function shortHash(hash?: string): string {
  return hash ? `${hash.slice(0, 10)}…${hash.slice(-6)}` : "";
}

export function formatDateTime(tsSec: bigint | number): string {
  // English UI: fixed en-US format, but in the viewer's own time zone
  return new Date(Number(tsSec) * 1000).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "local time";
  }
}

export function formatDuration(totalSeconds: number): string {
  if (totalSeconds <= 0) return "0s";
  const d = Math.floor(totalSeconds / 86_400);
  const h = Math.floor((totalSeconds % 86_400) / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/**
 * Exact token amount, rounded DOWN (never shows more than the wallet holds), thousands separators,
 * at most `maxFraction` decimals with trailing zeros trimmed to `minFraction`.
 */
export function formatTokenFloor(value: bigint, decimals: number, maxFraction = 2, minFraction = 2): string {
  const frac = Math.min(maxFraction, decimals);
  const scaled = decimals > frac ? value / 10n ** BigInt(decimals - frac) : value * 10n ** BigInt(frac - decimals);
  const whole = scaled / 10n ** BigInt(frac);
  let fraction = frac > 0 ? (scaled % 10n ** BigInt(frac)).toString().padStart(frac, "0") : "";
  while (fraction.length > minFraction && fraction.endsWith("0")) fraction = fraction.slice(0, -1);
  return `${whole.toLocaleString("en-US")}${fraction ? `.${fraction}` : ""}`;
}
