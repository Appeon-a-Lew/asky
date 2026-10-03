import Shell from "@/components/Shell";
import HubNav from "./HubNav";

export default function HubLayout({ children }: { children: React.ReactNode }) {
  return (
    <Shell>
      <div className="mx-auto flex max-w-7xl gap-6 px-5 py-6">
        <HubNav />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </Shell>
  );
}
