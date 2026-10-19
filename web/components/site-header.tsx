"use client";

import {
  Award,
  Bot,
  ChartColumn,
  FilePlus2,
  FolderKanban,
  Gavel,
  Gem,
  LayoutDashboard,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Scale,
  ShieldCheck,
  Store,
  UserCog,
  X,
  type LucideIcon,
} from "lucide-react";
import { AnimatePresence, LayoutGroup, motion, type Transition } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AccountMenu } from "@/components/account-panel";
import { NetworkChip } from "@/components/network-chip";
import { BrandLogo } from "@/components/brand-logo";
import { ThemePicker } from "@/components/theme-picker";
import { DISPUTES_ADDRESS, NFT_AUCTION_ADDRESS } from "@/lib/env";
import { cn } from "@/lib/utils";
import { useAppliedTheme } from "@/lib/preferences";
import { SIDEBAR_COOKIE } from "@/lib/sidebar";

type NavLink = { href: string; label: string; icon: LucideIcon; badge?: string; iconClass?: string };
type NavSection = { label?: string; labelIcon?: LucideIcon; badge?: string; items: NavLink[] };

const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/marketplace", label: "Marketplace", icon: Store },
      { href: "/tenders/new", label: "Create Tender", icon: FilePlus2 },
      { href: "/my/tenders", label: "My Tenders", icon: FolderKanban },
      { href: "/my/bids", label: "My Bids", icon: Gavel },
      { href: "/nft", label: "NFT Auctions", icon: Gem, badge: NFT_AUCTION_ADDRESS ? undefined : "Soon" },
      { href: "/agent", label: "Agent", icon: Bot },
    ],
  },
  {
    // Section label, like "Workspace": these pages make the market's fairness checkable.
    label: "Proof of Fairness",
    labelIcon: ShieldCheck,
    items: [
      { href: "/disputes", label: "Dispute Center", icon: Scale, badge: DISPUTES_ADDRESS ? undefined : "Soon" },
      { href: "/analytics", label: "Analytics", icon: ChartColumn },
      { href: "/reputation", label: "Reputation", icon: Award },
    ],
  },
  { items: [{ href: "/profile", label: "Profile & Settings", icon: UserCog }] },
];

/** Brand glyphs (lucide has no brand icons). Filled, drawn in currentColor. */
function XIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}
function TelegramIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  );
}

const SOCIAL: { href: string; label: string; icon: (p: React.SVGProps<SVGSVGElement>) => React.ReactElement }[] = [
  { href: "https://x.com/Longlhu2Huu", label: "X", icon: XIcon },
  { href: "https://t.me/lebry123", label: "Telegram", icon: TelegramIcon },
];

/** Shared motion spec for the sidebar (stiffness 260 / damping 28 ≈ 350–450 ms settle). */
const SPRING: Transition = { type: "spring", stiffness: 260, damping: 28 };
const INSTANT: Transition = { duration: 0 };

const EXPANDED_WIDTH = 240;
/** 15px side padding + 42px item → icon centre stays at 36px in both states (no jump). */
const COLLAPSED_WIDTH = 72;

function useIsActive() {
  const pathname = usePathname();
  return (href: string) => (href === "/tenders/new" ? pathname === href : pathname.startsWith(href));
}

function Brand() {
  const theme = useAppliedTheme();
  return (
    <Link href="/" className="flex min-h-10 items-center" aria-label="Plinths home">
      <BrandLogo priority onLight={theme === "light"} className="h-7 sm:h-8" />
    </Link>
  );
}

/** Floating header bar (Plinths pages-header). Navigation lives in the sidebar on desktop. */
export function SiteHeader() {
  const isActive = useIsActive();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-2 z-40 mx-2.5 mt-2 sm:top-3.5 sm:mx-6 sm:mt-3.5">
      <div className="flex h-14 items-center gap-3 rounded-[15px] border border-overlay/[0.055] bg-[var(--header)] px-3 shadow-[0_16px_45px_var(--surface-shadow)] backdrop-blur-[16px] sm:h-[62px] sm:px-5">
        <Brand />
        <div className="ml-auto flex items-center gap-2">
          {/* Desktop: theme switch sits in the header; on small screens it lives in the menu. */}
          <ThemePicker labels={false} className="hidden w-[122px] rounded-full lg:flex [&>button]:rounded-full [&_span.absolute]:rounded-full" />
          <NetworkChip />
          <AccountMenu />
          <button
            className="grid size-10 place-items-center rounded-full hover:bg-overlay/5 lg:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.nav
            id="mobile-nav"
            key="mobile-nav"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={SPRING}
            className="mt-2 overflow-hidden rounded-[15px] border border-overlay/[0.055] bg-[var(--header-solid)] shadow-[0_16px_45px_var(--popover-shadow)] backdrop-blur-[16px] lg:hidden"
          >
            <LayoutGroup id="mobile-nav">
              <div className="p-2">
                <NavSections collapsed={false} isActive={isActive} onNavigate={() => setOpen(false)} />
              </div>
              <div className="flex gap-1.5 border-t border-overlay/[0.055] px-3.5 py-2">
                {SOCIAL.map((s) => (
                  <SocialItem key={s.href} item={s} />
                ))}
              </div>
              <div className="border-t border-overlay/[0.055] p-2">
                <ThemePicker />
              </div>
            </LayoutGroup>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}

/** Persistent left navigation for the workspace (desktop), collapsible to an icon rail. */
export function SiteSidebar({ initialCollapsed = false }: { initialCollapsed?: boolean }) {
  const isActive = useIsActive();
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  // Skip animating the very first paint; animate only user toggles afterwards.
  const [animate, setAnimate] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
  };

  const transition = animate ? SPRING : INSTANT;
  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <motion.aside
      aria-label="Workspace"
      initial={false}
      animate={{ width: collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH }}
      transition={transition}
      className="sticky top-[90px] hidden h-[calc(100vh-90px)] shrink-0 self-start overflow-hidden border-r border-overlay/[0.055] bg-[linear-gradient(90deg,var(--sidebar-from),var(--sidebar-to))] px-[15px] py-8 lg:flex lg:flex-col"
    >
      <div className="relative mb-3 flex h-[34px] items-center">
        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.span
              key="label"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={transition}
              className="eyebrow mx-3 block whitespace-nowrap text-[0.62rem] tracking-[0.14em] text-muted-foreground"
            >
              Workspace
            </motion.span>
          )}
        </AnimatePresence>
        {/* Pinned to the right edge; at 72px this is the rail centre, so the button never jumps. */}
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="absolute right-0 grid size-[42px] place-items-center rounded-[11px] text-muted-foreground transition-colors duration-200 hover:bg-overlay/[0.045] hover:text-foreground"
        >
          <ToggleIcon className="size-[18px]" />
        </button>
      </div>
      <LayoutGroup id="sidebar-nav">
        <nav className="min-h-0 overflow-y-auto overflow-x-hidden">
          <NavSections collapsed={collapsed} isActive={isActive} transition={transition} />
        </nav>
      </LayoutGroup>
      <div className={cn("mt-4 flex gap-1.5 border-t border-overlay/[0.055] pt-4", collapsed ? "flex-col" : "px-1.5")}>
        {SOCIAL.map((s) => (
          <SocialItem key={s.href} item={s} />
        ))}
      </div>
    </motion.aside>
  );
}

/** Nav links in sections; a section after the first starts with a rule and, when expanded, its label. */
function NavSections({
  collapsed,
  isActive,
  transition = SPRING,
  onNavigate,
}: {
  collapsed: boolean;
  isActive: (href: string) => boolean;
  transition?: Transition;
  onNavigate?: () => void;
}) {
  return (
    <>
      {NAV_SECTIONS.map((section, i) => (
        <div key={section.label ?? i} className={cn("grid gap-1", i > 0 && "mt-2.5 border-t border-overlay/[0.055] pt-2.5")}>
          {section.label && !collapsed && (
            <p className="eyebrow mx-3 mb-1 flex items-center gap-2 whitespace-nowrap text-[0.62rem] tracking-[0.14em] text-muted-foreground">
              {section.labelIcon && <section.labelIcon className="size-3.5 text-success-fg" aria-hidden="true" />}
              {section.label}
              {section.badge && (
                <span className="rounded-full border border-[rgba(131,170,255,.3)] px-1.5 py-px text-[0.56rem] font-medium tracking-[0.06em] text-link">
                  {section.badge}
                </span>
              )}
            </p>
          )}
          {section.items.map((n) => (
            <NavItem key={n.href} item={n} active={isActive(n.href)} collapsed={collapsed} transition={transition} onClick={onNavigate} />
          ))}
        </div>
      ))}
    </>
  );
}

function NavItem({
  item,
  active,
  collapsed,
  transition = SPRING,
  onClick,
}: {
  item: NavLink;
  active: boolean;
  collapsed: boolean;
  transition?: Transition;
  onClick?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      aria-label={item.label}
      title={collapsed ? item.label : undefined}
      className={cn(
        "relative flex min-h-[40px] items-center gap-3 overflow-hidden whitespace-nowrap rounded-[11px] px-3 text-[0.78rem] text-foreground-soft transition-colors duration-200 hover:bg-overlay/[0.045] hover:text-foreground",
        active && "font-semibold text-foreground hover:bg-transparent hover:text-foreground",
      )}
    >
      {active && (
        // Existing active styling, moved onto a shared-layout layer so it slides between items.
        <motion.span
          layoutId="nav-active"
          transition={SPRING}
          style={{ borderRadius: 11 }}
          className="absolute inset-0 border border-[color-mix(in_srgb,var(--tint)_10%,transparent)] bg-[linear-gradient(100deg,color-mix(in_srgb,var(--tint)_13%,transparent),rgba(106,138,212,.07))] shadow-[inset_2px_0_var(--nav-bar)]"
          aria-hidden="true"
        />
      )}
      <Icon className={cn("relative z-[1] size-[18px] shrink-0", item.iconClass)} aria-hidden="true" />
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.span
            key="label"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={transition}
            className="relative z-[1] flex items-center gap-2"
          >
            {item.label}
            {item.badge && (
              <span className="rounded-full border border-[rgba(131,170,255,.3)] px-1.5 py-px text-[0.6rem] font-medium uppercase tracking-[0.06em] text-link">
                {item.badge}
              </span>
            )}
          </motion.span>
        )}
      </AnimatePresence>
    </Link>
  );
}

/** External community link: brand logo only (name in the accessible label and tooltip). */
function SocialItem({ item }: { item: (typeof SOCIAL)[number] }) {
  const Icon = item.icon;
  return (
    <a
      href={item.href}
      target="_blank"
      rel="noreferrer"
      aria-label={`${item.label} (opens in a new tab)`}
      title={item.label}
      className="grid size-[42px] shrink-0 place-items-center rounded-[11px] text-foreground-soft transition-[color,background-color,transform] duration-200 hover:-translate-y-px hover:bg-overlay/[0.045] hover:text-foreground"
    >
      <Icon className={item.label === "X" ? "size-[20px]" : "size-[23px]"} />
    </a>
  );
}
