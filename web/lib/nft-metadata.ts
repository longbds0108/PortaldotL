import { z } from "zod";
import { fetchJson, proxyPath, resolveUri } from "./ipfs";

/** ERC-721 metadata JSON (OpenSea-style). Untrusted: every field is optional except what we render. */
export const nftMetadataSchema = z.object({
  name: z.string().max(200).optional(),
  description: z.string().max(5000).optional(),
  image: z.string().max(2000).optional(),
  attributes: z
    .array(z.object({ trait_type: z.string().max(100).optional(), value: z.union([z.string().max(200), z.number()]) }))
    .max(50)
    .optional(),
});
export type NftMetadata = z.infer<typeof nftMetadataSchema>;

export async function fetchNftMetadata(tokenURI: string): Promise<NftMetadata> {
  return nftMetadataSchema.parse(await fetchJson(tokenURI));
}

/** Gateway URL for an ipfs://, https:// or data: image, or undefined when it cannot be displayed. */
export function nftImageUrl(image: string | undefined): string | undefined {
  if (!image) return undefined;
  try {
    // IPFS images go through the app's immutable cache (/api/doc) so they show instantly after the first view.
    return proxyPath(image) ?? resolveUri(image);
  } catch {
    return undefined;
  }
}
