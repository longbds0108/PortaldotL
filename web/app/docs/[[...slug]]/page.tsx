import { ArrowLeft, ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DOC_CONTENT } from "@/components/docs/content";
import { DOC_PAGES, docHref, findDoc } from "@/lib/docs";
import { NETWORK_NAME } from "@/lib/network";

type Props = { params: Promise<{ slug?: string[] }> };

const slugOf = (parts?: string[]) => (parts ?? []).join("/");

export function generateStaticParams() {
  return DOC_PAGES.map((p) => ({ slug: p.slug ? [p.slug] : [] }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const doc = findDoc(slugOf((await params).slug));
  return { title: doc ? `${doc.page.title} — Plinths Docs` : "Docs — Plinths" };
}

export default async function DocPage({ params }: Props) {
  const slug = slugOf((await params).slug);
  const doc = findDoc(slug);
  const content = DOC_CONTENT[slug];
  if (!doc || !content) notFound();

  return (
    <article className="mx-auto max-w-[680px]">
      <p className="flex items-center gap-3 text-[12px] font-semibold uppercase tracking-[0.2em] text-[#6f7690]">
        {doc.page.group}
        <i className="size-1.5 rounded-full bg-[#8fb4ff]" />
        {String(doc.index + 1).padStart(2, "0")}
      </p>
      <h1 className="mt-4 text-[clamp(1.9rem,4vw,2.25rem)] font-semibold leading-tight tracking-[-0.025em] text-white">{content.title}</h1>
      {content.body}

      <nav aria-label="Pagination" className="mt-16 grid grid-cols-2 border-t border-white/[0.08]">
        {doc.prev ? (
          <Link href={docHref(doc.prev.slug)} className="group border-r border-white/[0.08] py-6 pr-4">
            <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6f7690]">
              <ArrowLeft className="size-3.5 transition-transform group-hover:-translate-x-0.5" /> Previous
            </span>
            <span className="mt-2 block text-[14px] font-semibold text-white">{doc.prev.title}</span>
          </Link>
        ) : (
          <span className="border-r border-white/[0.08]" />
        )}
        {doc.next ? (
          <Link href={docHref(doc.next.slug)} className="group py-6 pl-4 text-right">
            <span className="flex items-center justify-end gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6f7690]">
              Next <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
            <span className="mt-2 block text-[14px] font-semibold text-white">{doc.next.title}</span>
          </Link>
        ) : (
          <span />
        )}
      </nav>
      <p className="mt-8 text-[12px] text-[#6f7690]">Plinths documentation · {NETWORK_NAME}</p>
    </article>
  );
}
