import { shortAddress, shortHash } from "@/lib/format";

export function ChainReference({ type, value, label }: { type: "tx" | "address" | "block"; value: string; label?: string }) {
  const text = label ?? (type === "address" ? shortAddress(value) : type === "tx" ? shortHash(value) : `#${value}`);
  return (
    <span className="inline-flex items-center gap-1 font-mono text-xs text-link" title={`${type}: ${value}`}>
      {text}
    </span>
  );
}
