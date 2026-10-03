"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/hub", label: "Overview", exact: true },
  { href: "/hub/pages", label: "Pages" },
  { href: "/hub/graph", label: "Process graph" },
  { href: "/hub/sessions", label: "Sessions & Work Maps" },
  { href: "/hub/lessons", label: "Lessons" },
  { href: "/hub/docs", label: "Docs & drift" },
  { href: "/hub/people", label: "People & coverage" },
  { href: "/hub/tools", label: "Domain MCP" },
];

export default function HubNav() {
  const path = usePathname();
  return (
    <nav className="sticky top-6 h-fit w-48 shrink-0 space-y-0.5 text-sm">
      <div className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-stone-400">Knowledge hub</div>
      {ITEMS.map((i) => {
        const on = i.exact ? path === i.href : path.startsWith(i.href);
        return (
          <Link key={i.href} href={i.href} className={`block rounded-md px-2 py-1.5 ${on ? "bg-white font-medium shadow-sm ring-1 ring-stone-200" : "text-stone-600 hover:bg-stone-100"}`}>
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
