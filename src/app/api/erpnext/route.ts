import { ERPNEXT_PUBLIC_URL, ERPNEXT_URL } from "@/lib/erpnext/client";
import { syncErpnext } from "@/lib/erpnext/mirror";
import { seedErpnext } from "@/lib/erpnext/seed";
import { db } from "@/lib/store";

// The real-app showcase: is ERPNext reachable, what does the mirror hold, replay the demo.
export async function GET() {
  const d = db();
  const up = await fetch(`${ERPNEXT_URL}/api/method/ping`).then((r) => r.ok).catch(() => false);
  return Response.json({
    url: ERPNEXT_PUBLIC_URL,
    up,
    catalog: d.catalogs?.erpnext ? { tools: d.catalogs.erpnext.tools.length, aligned: d.catalogs.erpnext.alignment?.filter((a) => a.tools.length).length ?? 0, of: d.catalogs.erpnext.alignment?.length ?? 0 } : null,
    mirror: d.erp ? { syncedAt: d.erp.syncedAt, invoices: d.erp.invoices.length, open: d.erp.invoices.filter((i) => i.status !== "posted").map((i) => ({ id: i.id, title: i.title, status: i.status })) } : null,
  });
}

export async function POST(req: Request) {
  const { action } = (await req.json()) as { action: "sync" | "reset" | "training" };
  try {
    // reset: a fresh month-end queue for Capture · training: the same plus the cases for Teach
    if (action === "reset" || action === "training") await seedErpnext({ reset: true, training: action === "training" });
    const erp = await syncErpnext();
    return Response.json({ ok: true, invoices: erp?.invoices.length ?? 0 });
  } catch (e) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: 502 });
  }
}
