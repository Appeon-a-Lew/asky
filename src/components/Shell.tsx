"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Icon, type IconName } from "./icons";
import { useWorkspaceInfo } from "./useWorkspaceInfo";

type Item = { href: string; label: string; icon: IconName; step?: string; exact?: boolean };

const FLOW: Item[] = [
  { href: "/interview", label: "Interview", icon: "mic", step: "0" },
  { href: "/capture", label: "Capture", icon: "capture", step: "1" },
  { href: "/hub", label: "Knowledge Hub", icon: "hub", step: "2" },
  { href: "/teach", label: "Teach", icon: "teach", step: "3" },
];

const HUB: Item[] = [
  { href: "/hub", label: "Overview", icon: "overview", exact: true },
  { href: "/hub/pages", label: "Pages", icon: "pages" },
  { href: "/hub/graph", label: "Process graph", icon: "graph" },
  { href: "/hub/sessions", label: "Sessions & Work Maps", icon: "sessions" },
  { href: "/hub/lessons", label: "Lessons", icon: "lessons" },
  { href: "/hub/docs", label: "Docs & drift", icon: "docs" },
  { href: "/hub/people", label: "People & coverage", icon: "people" },
  { href: "/hub/blacklist", label: "Supplier blacklist", icon: "shield" },
  { href: "/hub/tools", label: "Domain MCP", icon: "tools" },
];

const PREF = "asky.sidebar";
const prefListeners = new Set<() => void>();

function subscribePref(cb: () => void) {
  prefListeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    prefListeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

/** "open" | "closed" as chosen by the user; narrow windows default to closed. */
function readPref(): string | null {
  try {
    return localStorage.getItem(PREF) ?? (window.innerWidth < 1024 ? "closed" : null);
  } catch {
    return null;
  }
}

function writePref(v: "open" | "closed") {
  try { localStorage.setItem(PREF, v); } catch {}
  prefListeners.forEach((l) => l());
}

function EngineStatus({ collapsed }: { collapsed: boolean }) {
  const [cfg, setCfg] = useState<{ elevenlabs: boolean; llm: boolean; jev: boolean } | null>(null);
  useEffect(() => {
    fetch("/api/voice/config").then((r) => r.json()).then(setCfg).catch(() => {});
  }, []);
  if (!cfg) return null;
  const rows: [string, boolean, string, string][] = [
    ["Voice", cfg.elevenlabs, "ElevenLabs", "browser"],
    ["Decide", cfg.jev, "Jev", "rules"],
    ["LLM", cfg.llm, "Claude", "offline"],
  ];
  const dot = (on: boolean, key?: string) => <span key={key} className={`block h-1.5 w-1.5 shrink-0 rounded-full ${on ? "bg-emerald-400 shadow-[0_0_6px] shadow-emerald-400/60" : "bg-stone-600"}`} />;
  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-1.5 py-1" title={rows.map(([l, on, a, b]) => `${l}: ${on ? a : b}`).join("\n")}>
        {rows.map(([l, on]) => dot(on, l))}
      </div>
    );
  }
  return (
    <div className="space-y-1 rounded-lg bg-white/[0.03] p-2.5 text-[11px] ring-1 ring-white/5">
      <div className="mb-1.5 font-medium uppercase tracking-wider text-stone-500">Engines</div>
      {rows.map(([l, on, a, b]) => (
        <div key={l} className="flex items-center gap-2">
          {dot(on)}
          <span className="text-stone-500">{l}</span>
          <span className={`ml-auto ${on ? "text-stone-200" : "text-stone-500"}`}>{on ? a : b}</span>
        </div>
      ))}
    </div>
  );
}

function NavLink({ item, active, collapsed, sub, open }: { item: Item; active: boolean; collapsed: boolean; sub?: boolean; open?: boolean }) {
  const base = "group flex items-center rounded-lg transition-colors";
  const tone = active ? "bg-white/10 text-white" : open ? "text-white hover:bg-white/5" : "text-stone-400 hover:bg-white/5 hover:text-stone-100";
  if (collapsed) {
    return (
      <Link href={item.href} title={item.label} aria-label={item.label} className={`${base} ${tone} mx-auto justify-center ${sub ? "h-8 w-8" : "h-9 w-9"}`}>
        <Icon name={item.icon} className={`${sub ? "h-3.5 w-3.5" : "h-[18px] w-[18px]"} ${active ? "text-amber-300" : ""}`} />
      </Link>
    );
  }
  if (sub) {
    return (
      <Link href={item.href} className={`${base} gap-2.5 px-2.5 py-1.5 text-[13px] ${active ? "bg-white/10 text-white" : "text-stone-400 hover:text-stone-100"}`}>
        <Icon name={item.icon} className={`h-3.5 w-3.5 ${active ? "text-amber-300" : "text-stone-500 group-hover:text-stone-300"}`} />
        {item.label}
      </Link>
    );
  }
  return (
    <Link href={item.href} className={`${base} ${tone} gap-3 px-2.5 py-2 text-sm`}>
      <Icon name={item.icon} className={`h-[18px] w-[18px] ${active || open ? "text-amber-300" : "text-stone-500 group-hover:text-stone-300"}`} />
      <span className="flex-1">{item.label}</span>
      {item.step && <span className={`font-mono text-[10px] ${active ? "text-amber-300/80" : "text-stone-600"}`}>{item.step}</span>}
    </Link>
  );
}

export default function Shell({ children, full }: { children: React.ReactNode; full?: boolean }) {
  const path = usePathname();
  // Working screens (capture, teach) start with the rail collapsed so the app gets the width.
  const pref = useSyncExternalStore(subscribePref, readPref, () => null);
  const collapsed = pref ? pref === "closed" : !!full;
  const toggle = () => writePref(collapsed ? "open" : "closed");
  const on = (i: Item) => (i.exact ? path === i.href : path.startsWith(i.href));
  const inHub = path.startsWith("/hub");
  const ws = useWorkspaceInfo();
  const visitor = !!ws?.visitor;

  return (
    <div className="flex h-screen bg-background">
      <aside className={`flex shrink-0 flex-col bg-stone-950 text-stone-300 transition-[width] duration-200 ${collapsed ? "w-16" : "w-64"}`}>
        <div className={`flex h-14 items-center ${collapsed ? "justify-center" : "gap-2.5 px-4"}`}>
          <Link href="/home" className="flex items-center gap-2.5" title="asky home">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-amber-300 to-amber-500 text-[15px] font-bold text-stone-950 shadow-sm shadow-amber-500/20">a</span>
            {!collapsed && (
              <span className="leading-tight">
                <span className="block text-[15px] font-semibold tracking-tight text-white">asky</span>
                <span className="block text-[11px] text-stone-500">the AI apprentice</span>
              </span>
            )}
          </Link>
        </div>

        <nav className={`flex-1 space-y-6 overflow-y-auto py-4 ${collapsed ? "px-2" : "px-3"}`}>
          <div className="space-y-0.5">
            {visitor && <NavLink item={{ href: "/start", label: "Start here", icon: "arrow", exact: true }} active={path === "/start"} collapsed={collapsed} />}
            <NavLink item={{ href: "/home", label: "Home", icon: "home", exact: true }} active={path === "/home"} collapsed={collapsed} />
          </div>
          <div className="space-y-0.5">
            {!collapsed && <div className="mb-2 px-2.5 text-[11px] font-medium uppercase tracking-wider text-stone-600">Workflow</div>}
            {FLOW.map((i) => (
              <div key={i.href}>
                <NavLink item={i} active={i.href === "/hub" ? inHub && collapsed : on(i)} open={i.href === "/hub" && inHub} collapsed={collapsed} />
                {i.href === "/hub" && inHub && (
                  <div className={collapsed ? "mt-1 space-y-0.5 rounded-lg bg-white/[0.03] py-1" : "my-1 ml-[18px] space-y-0.5 border-l border-white/10 pl-2.5"}>
                    {HUB.map((h) => <NavLink key={h.href} item={h} active={on(h)} collapsed={collapsed} sub />)}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="space-y-0.5">
            {!collapsed && <div className="mb-2 px-2.5 text-[11px] font-medium uppercase tracking-wider text-stone-600">Target app</div>}
            {[
              { href: "/app", label: "Ledgerline AP", hint: "mock" },
              // the real ERP is one shared system: presenter only (the landing page shows it at work)
              ...(visitor ? [] : [{ href: "/erpnext", label: "ERPNext", hint: "real" }]),
            ].map((a) => (
              <a key={a.label} href={a.href} target="_blank" rel="noreferrer" title={a.label} className={`group flex items-center rounded-lg text-stone-400 transition-colors hover:bg-white/5 hover:text-stone-100 ${collapsed ? "mx-auto h-9 w-9 justify-center" : "gap-3 px-2.5 py-2 text-sm"}`}>
                <Icon name="app" className="h-[18px] w-[18px] text-stone-500 group-hover:text-stone-300" />
                {!collapsed && <><span className="flex-1">{a.label} <span className="text-[11px] text-stone-600">{a.hint}</span></span><Icon name="external" className="h-3.5 w-3.5 text-stone-600" /></>}
              </a>
            ))}
          </div>
        </nav>

        <div className={`space-y-2 border-t border-white/5 py-3 ${collapsed ? "px-2" : "px-3"}`}>
          {visitor && ws && !collapsed && <VisitorBadge info={ws} />}
          <EngineStatus collapsed={collapsed} />
          <button onClick={toggle} title={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} className={`flex items-center rounded-lg text-xs text-stone-500 transition-colors hover:bg-white/5 hover:text-stone-200 ${collapsed ? "mx-auto h-9 w-9 justify-center" : "w-full gap-3 px-2.5 py-2"}`}>
            <Icon name="panel" className="h-4 w-4" />
            {!collapsed && "Collapse"}
          </button>
        </div>
      </aside>

      <main className={`min-w-0 flex-1 ${full ? "overflow-hidden" : "overflow-y-auto"}`}>{children}</main>
    </div>
  );
}

/** Audience workspace: private, temporary, budgeted — and how to leave. */
function VisitorBadge({ info }: { info: import("./useWorkspaceInfo").WorkspaceInfo }) {
  const until = info.expiresAt ? new Date(info.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
  const left = info.limits && info.usage ? Math.max(0, info.limits.llm - info.usage.llm) : null;
  return (
    <div className="rounded-xl bg-amber-400/10 p-2.5 text-[11px] leading-relaxed text-amber-100 ring-1 ring-amber-400/20">
      <div className="font-semibold text-amber-300">Your private demo</div>
      <div className="text-amber-100/70">Only you see it · deleted at {until}{left !== null ? ` · ${left} AI calls left` : ""}</div>
      <button
        onClick={async () => {
          await fetch("/api/workspace", { method: "DELETE" });
          window.location.assign(new URL("/", window.location.origin).href); // full reload: the workspace is gone
        }}
        className="mt-1 text-amber-300 underline underline-offset-2"
      >
        Leave
      </button>
    </div>
  );
}
