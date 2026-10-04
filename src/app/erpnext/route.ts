import { ERPNEXT_PUBLIC_URL } from "@/lib/erpnext/client";

// The sidebar's "ERPNext" link: resolved at request time, so the same build works locally and on the server.
export function GET() {
  return Response.redirect(`${ERPNEXT_PUBLIC_URL}/app/purchase-invoice`, 302);
}
