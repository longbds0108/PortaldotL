/** Docs navigation (Vitael-style grouped sidebar). Content lives in components/docs/content.tsx. */
export type DocPage = { slug: string; title: string; group: string };

export const DOC_GROUPS: { label: string; pages: DocPage[] }[] = [
  {
    label: "Overview",
    pages: [
      { slug: "", title: "What is Plinths?", group: "Overview" },
      { slug: "getting-started", title: "Getting started", group: "Overview" },
      { slug: "sealed-bidding", title: "How sealed bidding works", group: "Overview" },
    ],
  },
  {
    label: "For buyers",
    pages: [
      { slug: "create-tender", title: "Creating a tender", group: "For buyers" },
      { slug: "evaluate-award", title: "Evaluating & awarding", group: "For buyers" },
      { slug: "ai-review", title: "AI proposal review", group: "For buyers" },
    ],
  },
  {
    label: "For bidders",
    pages: [
      { slug: "submit-bid", title: "Submitting a sealed bid", group: "For bidders" },
      { slug: "reveal-bonds", title: "Revealing & bonds", group: "For bidders" },
    ],
  },
  {
    label: "Protocol",
    pages: [
      { slug: "lifecycle", title: "Tender lifecycle", group: "Protocol" },
      { slug: "proof-of-process", title: "Proof of process", group: "Protocol" },
      { slug: "security", title: "Security & privacy", group: "Protocol" },
      { slug: "smart-contract", title: "Smart contracts", group: "Protocol" },
    ],
  },
  { label: "NFT auctions", pages: [{ slug: "nft-auctions", title: "Sealed-bid NFT auctions", group: "NFT auctions" }] },
  {
    label: "Proof of Fairness",
    pages: [
      { slug: "disputes", title: "Dispute process", group: "Proof of Fairness" },
      { slug: "analytics", title: "Analytics", group: "Proof of Fairness" },
      { slug: "reputation", title: "Reputation", group: "Proof of Fairness" },
    ],
  },
  { label: "Resources", pages: [{ slug: "faq", title: "FAQ", group: "Resources" }] },
];

export const DOC_PAGES: DocPage[] = DOC_GROUPS.flatMap((g) => g.pages);

export function docHref(slug: string) {
  return slug ? `/docs/${slug}` : "/docs";
}

export function findDoc(slug: string) {
  const index = DOC_PAGES.findIndex((p) => p.slug === slug);
  if (index < 0) return undefined;
  return { page: DOC_PAGES[index], index, prev: DOC_PAGES[index - 1], next: DOC_PAGES[index + 1] };
}
