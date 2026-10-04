import { ERPNEXT_PUBLIC_URL } from "@/lib/erpnext/client";
import { withWorkspace } from "@/lib/workspace";

// The sidebar's "ERPNext" link: resolved at request time, so the same build works locally and on the server.
function handleGET() {
  return Response.redirect(`${ERPNEXT_PUBLIC_URL}/app/purchase-invoice`, 302);
}

export const GET = withWorkspace(handleGET);
