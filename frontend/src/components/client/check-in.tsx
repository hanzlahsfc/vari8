"use client";

import { FormPreview } from "@/components/coach/form-preview";
import { Button, Status } from "@/components/vari8/components";
import type { ParsedDemo } from "./demo/state";
import { useDemoSlice, useDemoStore } from "./demo/store";
import { ClientScreen, DemoGate } from "./shell";

export function CheckInScreen({ demo }: { demo: ParsedDemo }) {
  const { asOf } = useDemoStore();
  const [checkIn, setCheckIn] = useDemoSlice("checkIn");
  return (
    <ClientScreen
      title="Check-in"
      description="Weekly check-in. Demo submit stores nothing."
    >
      <DemoGate demo={demo} empty="No check-in form is published yet.">
        <FormPreview variant={checkIn.form} custom={false} />
        {checkIn.submittedAt ? (
          <Status tone="positive">
            Submitted {checkIn.submittedAt} - demo only, nothing was sent
          </Status>
        ) : (
          <div>
            <Button
              variant="primary"
              onClick={() =>
                setCheckIn((current) => ({ ...current, submittedAt: asOf }))
              }
            >
              Submit check-in
            </Button>
          </div>
        )}
      </DemoGate>
    </ClientScreen>
  );
}
