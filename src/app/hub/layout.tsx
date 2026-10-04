import Shell from "@/components/Shell";

export default function HubLayout({ children }: { children: React.ReactNode }) {
  return (
    <Shell>
      <div className="mx-auto max-w-7xl px-8 py-8">{children}</div>
    </Shell>
  );
}
