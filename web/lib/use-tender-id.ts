"use client";

import { useParams } from "next/navigation";

/** Parses /tenders/[id] into a bigint, or undefined if malformed. */
export function useTenderIdParam(): bigint | undefined {
  const { id } = useParams<{ id: string }>();
  return /^\d{1,30}$/.test(id ?? "") ? BigInt(id) : undefined;
}
