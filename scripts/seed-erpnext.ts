// Seed ERPNext for the real-app showcase (see src/lib/erpnext/seed.ts).
//
//   pnpm seed:erpnext            # idempotent: creates what is missing
//   pnpm seed:erpnext --reset    # also deletes and recreates the open queue (replay the demo)
//
// ERPNEXT_URL / ERPNEXT_USER / ERPNEXT_PASSWORD default to the frappe_docker sandbox.

import { seedErpnext } from "../src/lib/erpnext/seed";

seedErpnext({ reset: process.argv.includes("--reset"), log: console.log })
  .then(() => console.log("✔ ERPNext seeded — open http://localhost:8080/app/purchase-invoice"))
  .catch((e) => {
    console.error(e.message ?? e);
    process.exit(1);
  });
