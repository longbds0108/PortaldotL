import type { Text } from "./i18n";

/**
 * Docs navigation (Vitael-style grouped sidebar). Content lives in components/docs/content.tsx and its Vietnamese
 * edition content.vi.tsx.
 */
export type DocPage = { slug: string; title: Text; group: Text };

const OVERVIEW: Text = ["Overview", "Tổng quan"];
const BUYERS: Text = ["For buyers", "Cho bên mời thầu"];
const BIDDERS: Text = ["For bidders", "Cho nhà thầu"];
const PROTOCOL: Text = ["Protocol", "Giao thức"];
const NFT: Text = ["NFT auctions", "Đấu giá NFT"];
const FAIRNESS: Text = ["Proof of Fairness", "Bằng chứng công bằng"];
const RESOURCES: Text = ["Resources", "Tài nguyên"];

export const DOC_GROUPS: { label: Text; pages: DocPage[] }[] = [
  {
    label: OVERVIEW,
    pages: [
      { slug: "", title: ["What is Plinths?", "Plinths là gì?"], group: OVERVIEW },
      { slug: "getting-started", title: ["Getting started", "Bắt đầu"], group: OVERVIEW },
      { slug: "sealed-bidding", title: ["How sealed bidding works", "Đấu thầu niêm phong hoạt động thế nào"], group: OVERVIEW },
    ],
  },
  {
    label: BUYERS,
    pages: [
      { slug: "create-tender", title: ["Creating a tender", "Tạo gói thầu"], group: BUYERS },
      { slug: "evaluate-award", title: ["Evaluating & awarding", "Đánh giá & trao thầu"], group: BUYERS },
      { slug: "ai-review", title: ["AI proposal review", "Đánh giá hồ sơ bằng AI"], group: BUYERS },
    ],
  },
  {
    label: BIDDERS,
    pages: [
      { slug: "submit-bid", title: ["Submitting a sealed bid", "Gửi giá niêm phong"], group: BIDDERS },
      { slug: "reveal-bonds", title: ["Revealing & bonds", "Công bố & tiền bảo đảm"], group: BIDDERS },
    ],
  },
  {
    label: PROTOCOL,
    pages: [
      { slug: "lifecycle", title: ["Tender lifecycle", "Vòng đời gói thầu"], group: PROTOCOL },
      { slug: "proof-of-process", title: ["Proof of process", "Bằng chứng quy trình"], group: PROTOCOL },
      { slug: "security", title: ["Security & privacy", "Bảo mật & quyền riêng tư"], group: PROTOCOL },
      { slug: "smart-contract", title: ["Smart contracts", "Smart contract"], group: PROTOCOL },
    ],
  },
  { label: NFT, pages: [{ slug: "nft-auctions", title: ["Sealed-bid NFT auctions", "Đấu giá NFT niêm phong"], group: NFT }] },
  {
    label: FAIRNESS,
    pages: [
      { slug: "disputes", title: ["Dispute process", "Quy trình khiếu nại"], group: FAIRNESS },
      { slug: "analytics", title: ["Analytics", "Phân tích"], group: FAIRNESS },
      { slug: "reputation", title: ["Reputation", "Uy tín"], group: FAIRNESS },
    ],
  },
  { label: RESOURCES, pages: [{ slug: "faq", title: ["FAQ", "Câu hỏi thường gặp"], group: RESOURCES }] },
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
