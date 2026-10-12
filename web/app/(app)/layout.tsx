import { cookies } from "next/headers";
import { SiteHeader, SiteSidebar } from "@/components/site-header";
import { SIDEBAR_COOKIE } from "@/lib/sidebar";
import { LocalChainBanner } from "@/components/local-chain-banner";
import { IS_LOCAL_CHAIN, NETWORK_NAME } from "@/lib/network";

/** Workspace shell: floating header + left sidebar (Hedgora app pages). */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const collapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === "1";
  return (
    <>
      <SiteHeader />
      {/* flex (not a fixed grid column) so content reflows with the animated sidebar width */}
      <div className="lg:mt-3.5 lg:flex">
        <SiteSidebar initialCollapsed={collapsed} />
        <div className="min-w-0 flex-1">
          <main className="mx-auto w-full max-w-[1240px] px-4 pb-16 pt-9 sm:px-6 lg:px-10 lg:pt-14">
            <LocalChainBanner className="mb-6" />
            {children}
          </main>
          <footer className="mx-auto max-w-[1240px] px-4 pb-10 text-[0.7rem] text-[#77717d] sm:px-6 lg:px-10">
            <span className="inline-flex items-center gap-2">
              <i className={`status-dot ${IS_LOCAL_CHAIN ? "text-warning" : "text-success"}`} /> BlindBid · {NETWORK_NAME} · Bid prices are sealed with commit–reveal and documents are encrypted in your browser.
            </span>
          </footer>
        </div>
      </div>
    </>
  );
}
