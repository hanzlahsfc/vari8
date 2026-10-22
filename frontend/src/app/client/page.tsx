import { parseDemo } from "@/components/client/demo/state";
import { ClientHome } from "@/components/client/home";
import { ClientShell } from "@/components/client/shell";

export default async function ClientPage({
  searchParams,
}: {
  searchParams: Promise<{ demo?: string | string[] }>;
}) {
  const { demo } = await searchParams;
  const parsed = parseDemo(demo);
  return (
    <ClientShell screen="home" demo={parsed}>
      <ClientHome demo={parsed} />
    </ClientShell>
  );
}
