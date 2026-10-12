import { ExternalLink } from "lucide-react";
import { EXPLORER_URL } from "@/lib/env";
import { shortAddress, shortHash } from "@/lib/format";

export function ExplorerLink({ type, value, label }: { type: "tx" | "address" | "block"; value: string; label?: string }) {
  const text = label ?? (type === "address" ? shortAddress(value) : type === "tx" ? shortHash(value) : `#${value}`);
  return (
    <a
      href={`${EXPLORER_URL}/${type}/${value}`}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 font-mono text-xs text-[#c3d6ff] hover:text-white hover:underline"
    >
      {text}
      <ExternalLink className="size-3" />
    </a>
  );
}
