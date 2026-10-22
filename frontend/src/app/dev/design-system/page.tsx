import { notFound } from "next/navigation";

export default async function DesignSystemPage() {
  if (process.env.NODE_ENV !== "development") notFound();

  const { Vari8Playground } = await import("@/components/vari8/playground");
  return <Vari8Playground />;
}
