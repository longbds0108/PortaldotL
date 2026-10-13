import { cookies } from "next/headers";
import { SiteHeader, SiteSidebar } from "@/components/site-header";
import { SIDEBAR_COOKIE } from "@/lib/sidebar";
import { LocalChainBanner } from "@/components/local-chain-banner";
import { ThemeSync } from "@/components/theme-sync";
import { THEME_BOOT_SCRIPT } from "@/lib/theme-boot";

/** Workspace shell: floating header + left sidebar (Hedgora app pages). */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const collapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === "1";
  return (
    <>
      {/* Applies a saved light theme before the workspace paints (no dark flash). */}
      <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      <ThemeSync />
      <SiteHeader />
      {/* flex (not a fixed grid column) so content reflows with the animated sidebar width */}
      <div className="lg:mt-3.5 lg:flex">
        <SiteSidebar initialCollapsed={collapsed} />
        <div className="min-w-0 flex-1">
          <main className="mx-auto w-full max-w-[1240px] px-4 pb-16 pt-9 sm:px-6 lg:px-10 lg:pt-14">
            <LocalChainBanner className="mb-6" />
            {children}
          </main>
        </div>
      </div>
    </>
  );
}
