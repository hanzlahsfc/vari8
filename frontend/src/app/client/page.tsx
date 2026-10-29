import type { Metadata } from "next";
import { Suspense } from "react";
import { ClientRoute } from "@/components/client-app/client-route";

export const metadata: Metadata = {
  title: "Client app — local demo",
};

export default function ClientPage() {
  return (
    <Suspense>
      <ClientRoute />
    </Suspense>
  );
}
