import Link from "next/link";
import Instrumentation from "./Instrumentation";

export const metadata = { title: "Ledgerline AP" };

// The mock enterprise app. Deliberately plain and dense, like the real thing.
export default function APLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="ap-app min-h-screen bg-[#eef1f4] text-[13px] text-slate-800">
      <Instrumentation />
      <header className="flex items-center gap-6 bg-[#1f3b57] px-4 py-2 text-white">
        <Link href="/app" className="font-semibold tracking-wide">Ledgerline AP</Link>
        <span className="text-white/60">Keller Maschinenbau GmbH · Mandant 1000</span>
        <nav className="ml-auto flex gap-4 text-white/80">
          <Link href="/app" className="hover:text-white">Inbox</Link>
          <span className="cursor-default text-white/40">Reports</span>
          <span className="cursor-default text-white/40">Master data</span>
        </nav>
      </header>
      <main className="p-4">{children}</main>
    </div>
  );
}
