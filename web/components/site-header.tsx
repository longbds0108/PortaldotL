"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  EyeOff,
  FilePlus2,
  FolderKanban,
  Gavel,
  LayoutDashboard,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Store,
  UserCog,
  X,
  type LucideIcon,
} from "lucide-react";
import { AnimatePresence, LayoutGroup, motion, type Transition } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { IS_LOCAL_CHAIN, NETWORK_NAME } from "@/lib/network";
import { SIDEBAR_COOKIE } from "@/lib/sidebar";

const NAV: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/marketplace", label: "Marketplace", icon: Store },
  { href: "/tenders/new", label: "Create Tender", icon: FilePlus2 },
  { href: "/my/tenders", label: "My Tenders", icon: FolderKanban },
  { href: "/my/bids", label: "My Bids", icon: Gavel },
  { href: "/profile", label: "Profile & Settings", icon: UserCog },
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
  return (
    <Link href="/" className="flex min-h-10 items-center gap-2.5" aria-label="BlindBid home">
      <span className="grid size-8 place-items-center rounded-full bg-[linear-gradient(135deg,#e8e3d5,#83aaff)] text-[#100e13]">
        <EyeOff className="size-4" />
      </span>
      <span className="text-[1.05rem] font-semibold tracking-[-0.02em]">BlindBid</span>
    </Link>
  );
}

/** Floating header bar (Hedgora pages-header). Navigation lives in the sidebar on desktop. */
export function SiteHeader() {
  const isActive = useIsActive();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-2 z-40 mx-2.5 mt-2 sm:top-3.5 sm:mx-6 sm:mt-3.5">
      <div className="flex h-14 items-center gap-3 rounded-[15px] border border-white/[0.055] bg-[rgba(23,20,27,.9)] px-3 shadow-[0_16px_45px_rgba(0,0,0,.2)] backdrop-blur-[16px] sm:h-[62px] sm:px-5">
        <Brand />
        <span className={`eyebrow hidden md:inline ${IS_LOCAL_CHAIN ? "!text-warning" : ""}`}>{NETWORK_NAME}</span>
        <div className="ml-auto flex items-center gap-2">
          <ConnectButton chainStatus="icon" accountStatus={{ smallScreen: "avatar", largeScreen: "full" }} showBalance={{ smallScreen: false, largeScreen: true }} />
          <button
            className="grid size-10 place-items-center rounded-full hover:bg-white/5 lg:hidden"
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
            className="mt-2 overflow-hidden rounded-[15px] border border-white/[0.055] bg-[rgba(23,20,27,.97)] shadow-[0_16px_45px_rgba(0,0,0,.35)] backdrop-blur-[16px] lg:hidden"
          >
            <LayoutGroup id="mobile-nav">
              <div className="grid gap-1 p-2">
                {NAV.map((n) => (
                  <NavItem key={n.href} item={n} active={isActive(n.href)} collapsed={false} onClick={() => setOpen(false)} />
                ))}
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
      className="sticky top-[90px] hidden h-[calc(100vh-90px)] shrink-0 self-start overflow-hidden border-r border-white/[0.055] bg-[linear-gradient(90deg,rgba(20,18,24,.76),rgba(17,16,21,.25))] px-[15px] py-8 lg:block"
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
              className="eyebrow mx-3 block whitespace-nowrap text-[0.62rem] tracking-[0.14em] text-[#77717d]"
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
          className="absolute right-0 grid size-[42px] place-items-center rounded-[11px] text-[#77717d] transition-colors duration-200 hover:bg-white/[0.045] hover:text-[#f4f2f6]"
        >
          <ToggleIcon className="size-[18px]" />
        </button>
      </div>
      <LayoutGroup id="sidebar-nav">
        <nav className="grid gap-1.5">
          {NAV.map((n) => (
            <NavItem key={n.href} item={n} active={isActive(n.href)} collapsed={collapsed} transition={transition} />
          ))}
        </nav>
      </LayoutGroup>
    </motion.aside>
  );
}

function NavItem({
  item,
  active,
  collapsed,
  transition = SPRING,
  onClick,
}: {
  item: (typeof NAV)[number];
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
        "relative flex min-h-[43px] items-center gap-3 overflow-hidden whitespace-nowrap rounded-[11px] px-3 text-[0.78rem] text-[#a7a2ae] transition-colors duration-200 hover:bg-white/[0.045] hover:text-[#f4f2f6]",
        active && "font-semibold text-[#f3efe5] hover:bg-transparent hover:text-[#f3efe5]",
      )}
    >
      {active && (
        // Existing active styling, moved onto a shared-layout layer so it slides between items.
        <motion.span
          layoutId="nav-active"
          transition={SPRING}
          style={{ borderRadius: 11 }}
          className="absolute inset-0 border border-[rgba(232,227,213,.1)] bg-[linear-gradient(100deg,rgba(232,227,213,.13),rgba(106,138,212,.07))] shadow-[inset_2px_0_#e8e3d5]"
          aria-hidden="true"
        />
      )}
      <Icon className="relative z-[1] size-[18px] shrink-0" aria-hidden="true" />
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.span
            key="label"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={transition}
            className="relative z-[1]"
          >
            {item.label}
          </motion.span>
        )}
      </AnimatePresence>
    </Link>
  );
}
