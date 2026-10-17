"use client";

import { ArrowRight, ArrowUpRight, ChevronRight, ExternalLink, Menu, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { DOC_GROUPS, DOC_PAGES, docHref } from "@/lib/docs";
import { BLINDBID_ADDRESS, NODE_CONSOLE_URL } from "@/lib/env";
import { shortAddress } from "@/lib/format";
import { IS_LOCAL_CHAIN, NETWORK_NAME } from "@/lib/network";
import { cn } from "@/lib/utils";
import { chain } from "@/lib/wagmi";

/*
 * Docs layout modelled on vitael.xyz/docs: top bar with a pill nav and glowing "enter app" button,
 * breadcrumb strip, grouped left sidebar, centred article, right rail with network info + resources.
 * Recoloured with the Plinths palette.
 */

const REPO_URL = "https://github.com/longbds0108/PortaldotL";

function useCurrentDoc() {
  const pathname = usePathname();
  const slug = pathname.replace(/^\/docs\/?/, "").replace(/\/$/, "");
  return DOC_PAGES.find((p) => p.slug === slug);
}

export function DocsShell({ children }: { children: ReactNode }) {
  const current = useCurrentDoc();
  const [drawer, setDrawer] = useState(false);
  const pathname = usePathname();
  useEffect(() => setDrawer(false), [pathname]);

  return (
    <div className="min-h-dvh bg-[#050b14] text-white">
      {/* ───────── top bar ───────── */}
      <header className="sticky top-0 z-40 border-b border-white/[0.07] bg-[#050b14]/90 backdrop-blur-[14px]">
        <div className="mx-auto flex h-[74px] max-w-[1440px] items-center gap-4 px-4 sm:px-8 lg:grid lg:grid-cols-[1fr_auto_1fr]">
          <Link href="/" aria-label="Plinths home" className="flex items-center">
            <BrandLogo priority className="h-7 sm:h-8" />
          </Link>
          <nav className="hidden items-center gap-1 rounded-full border border-white/[0.09] bg-white/[0.03] p-1 lg:flex" aria-label="Site">
            <TopLink href="/#lifecycle">Lifecycle</TopLink>
            <TopLink href="/#how">How it works</TopLink>
            <TopLink href="/docs" active>
              Docs
            </TopLink>
          </nav>
          <div className="ml-auto flex items-center gap-2 lg:justify-self-end">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-full bg-[linear-gradient(135deg,#e8e3d5,#8fb4ff)] px-4 py-2.5 text-[14px] font-semibold text-[#0b0f1a] shadow-[0_0_28px_rgba(143,180,255,.35)] transition-[transform,box-shadow] hover:-translate-y-px hover:shadow-[0_0_36px_rgba(143,180,255,.5)]"
            >
              Launch app <ArrowUpRight className="size-4" />
            </Link>
            <button
              type="button"
              onClick={() => setDrawer((d) => !d)}
              aria-label={drawer ? "Close documentation menu" : "Open documentation menu"}
              aria-expanded={drawer}
              className="grid size-11 place-items-center rounded-full border border-white/[0.12] text-[#c4c8db] hover:bg-white/[0.05] lg:hidden"
            >
              {drawer ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
        </div>
      </header>

      {/* ───────── breadcrumb strip ───────── */}
      <div className="sticky top-[74px] z-30 border-b border-white/[0.07] bg-[#050b14]/90 backdrop-blur-[14px]">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-8">
          <p className="flex min-w-0 items-center gap-2 text-[14px]">
            <Link href="/docs" className="shrink-0 font-semibold text-white">
              Documentation
            </Link>
            <ChevronRight className="size-3.5 shrink-0 text-[#6f7690]" />
            <span className="truncate text-[#979eb8]">{current?.title ?? "Not found"}</span>
          </p>
          <div className="hidden items-center gap-5 text-[13px] text-[#979eb8] sm:flex">
            <a href={NODE_CONSOLE_URL} target="_blank" rel="noreferrer" className="hover:text-white">
              Node Console
            </a>
          </div>
        </div>
      </div>

      {/* ───────── mobile drawer ───────── */}
      <AnimatePresence>
        {drawer && (
          <motion.div
            key="drawer"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ type: "spring", stiffness: 260, damping: 28 }}
            className="fixed inset-x-0 bottom-0 top-[130px] z-30 overflow-y-auto border-t border-white/[0.07] bg-[#050b14] px-5 py-6 lg:hidden"
          >
            <SidebarNav />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mx-auto grid max-w-[1440px] lg:grid-cols-[270px_minmax(0,1fr)] xl:grid-cols-[270px_minmax(0,1fr)_260px]">
        <aside className="sticky top-[130px] hidden h-[calc(100dvh-130px)] overflow-y-auto border-r border-white/[0.07] px-8 py-10 lg:block">
          <SidebarNav />
        </aside>
        <main className="min-w-0 px-5 pb-16 pt-10 sm:px-10 lg:px-12">{children}</main>
        <aside className="sticky top-[130px] hidden h-[calc(100dvh-130px)] overflow-y-auto border-l border-white/[0.07] px-7 py-10 xl:block">
          <RightRail />
        </aside>
      </div>
    </div>
  );
}

function TopLink({ href, active, children }: { href: string; active?: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-full px-4 py-2 text-[15px] text-[#c4c8db] transition-colors hover:text-white",
        active && "bg-white/[0.08] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,.06)]",
      )}
    >
      {children}
    </Link>
  );
}

function SidebarNav() {
  const current = useCurrentDoc();
  return (
    <nav aria-label="Documentation" className="grid gap-8">
      {DOC_GROUPS.map((g) => (
        <div key={g.label}>
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6f7690]">{g.label}</p>
          <ul className="grid gap-0.5">
            {g.pages.map((p) => {
              const active = current?.slug === p.slug;
              return (
                <li key={p.slug}>
                  <Link
                    href={docHref(p.slug)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "block border-l-2 border-transparent px-3.5 py-2 text-[14px] text-[#a7acc5] transition-colors hover:text-white",
                      active && "border-[#8fb4ff] bg-[linear-gradient(90deg,rgba(143,180,255,.12),transparent)] font-semibold text-white",
                    )}
                  >
                    {p.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function RightRail() {
  const rows: [string, ReactNode][] = [
    ["Chain ID", String(chain.id)],
    ["Gas token", "tPOTv3"],
    [
      "Contract",
      BLINDBID_ADDRESS ? (
        <span className="font-[ui-monospace,SFMono-Regular,Menlo,monospace]">
          {shortAddress(BLINDBID_ADDRESS)}
        </span>
      ) : (
        "Not configured"
      ),
    ],
  ];
  return (
    <div className="grid gap-8 text-[13px]">
      <section>
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6f7690]">Network</p>
        <p className="flex items-center gap-2 text-[14px] text-white">
          <i className={cn("size-2 rounded-full", IS_LOCAL_CHAIN ? "bg-[#e8b54c]" : "bg-[#4fd1c5]")} />
          {NETWORK_NAME}
        </p>
        <dl className="mt-5 grid gap-4">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt className="text-[#6f7690]">{k}</dt>
              <dd className="mt-1 text-white">{v}</dd>
            </div>
          ))}
        </dl>
      </section>
      <div className="h-px bg-white/[0.07]" />
      <section>
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6f7690]">Resources</p>
        <ul className="grid gap-3.5 text-[#a7acc5]">
          <RailLink href={NODE_CONSOLE_URL} external>
            Portaldot Node Console
          </RailLink>
          <RailLink href={REPO_URL} external>
            GitHub
          </RailLink>
          <RailLink href="/dashboard">Open Plinths app</RailLink>
        </ul>
      </section>
      <section className="border-l-2 border-[#e8b54c] py-1 pl-3.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#e8b54c]">{IS_LOCAL_CHAIN ? "Local chain" : "Testnet"}</p>
        <p className="mt-1.5 leading-5 text-[#979eb8]">
          {IS_LOCAL_CHAIN
            ? "This build reads a local test chain. Balances and tenders are test data."
            : "Testnet build — tokens have no value. Verify the contract address before every interaction."}
        </p>
      </section>
    </div>
  );
}

function RailLink({ href, external, children }: { href: string; external?: boolean; children: ReactNode }) {
  const Icon = external ? ExternalLink : ArrowRight;
  const cls = "flex items-center justify-between gap-3 hover:text-white";
  return (
    <li>
      {external ? (
        <a href={href} target="_blank" rel="noreferrer" className={cls}>
          {children} <Icon className="size-3.5" />
        </a>
      ) : (
        <Link href={href} className={cls}>
          {children} <Icon className="size-3.5" />
        </Link>
      )}
    </li>
  );
}
