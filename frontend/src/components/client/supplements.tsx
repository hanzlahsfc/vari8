"use client";

import { SupplementPlanView } from "@/components/coach/supplements/plan-view";
import type { ParsedDemo } from "./demo/state";
import { useDemoSlice, useDemoStore } from "./demo/store";
import { ClientScreen, DemoGate } from "./shell";

export function SupplementsScreen({ demo }: { demo: ParsedDemo }) {
  const { client } = useDemoStore();
  const [supplements] = useDemoSlice("supplements");
  return (
    <ClientScreen
      title="Supplements"
      description="The plan your coach saved for you."
    >
      <DemoGate demo={demo} empty="No supplement plan is saved yet.">
        <SupplementPlanView
          plan={supplements.plan ?? undefined}
          clientName={client.name}
        />
      </DemoGate>
    </ClientScreen>
  );
}
