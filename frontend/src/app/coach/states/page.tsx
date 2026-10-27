"use client";

import { Inbox } from "lucide-react";
import { useState } from "react";
import {
  Button,
  Card,
  IconButton,
  Input,
  Select,
  Status,
  Toggle,
} from "@/components/vari8/components";
import {
  FormGrid,
  PageHeader,
  Section,
  Toolbar,
} from "@/components/vari8/layouts";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Skeleton,
} from "@/components/vari8/states";
import { vari8Theme } from "@/lib/vari8-theme";

/* W2-T2 demo mount. Synthetic data only. Proves the shared empty, loading
   and error primitives plus the input contract: every control is labelled,
   focus order is DOM order, and motion collapses under
   prefers-reduced-motion. */

type Phase = "ready" | "empty" | "loading" | "error";

const PHASES: { value: Phase; label: string }[] = [
  { value: "ready", label: "Ready" },
  { value: "empty", label: "Empty" },
  { value: "loading", label: "Loading" },
  { value: "error", label: "Error" },
];

const DEMO_CHECKINS = [
  { id: "c1", name: "Sample check-in one", state: "Complete" },
  { id: "c2", name: "Sample check-in two", state: "Pending" },
  { id: "c3", name: "Sample check-in three", state: "Pending" },
];

export default function CoachStatesDemoPage() {
  const [phase, setPhase] = useState<Phase>("ready");
  const [name, setName] = useState("Demo Coach");
  const [theme, setTheme] = useState("dark");
  const [notify, setNotify] = useState(true);

  return (
    <main
      className="v8-theme"
      data-mode="dark"
      style={{
        ...vari8Theme({ mode: "dark", accent: "#EB91B8" }),
        padding: "2rem",
      }}
    >
      <PageHeader
        title="Shared states"
        description="Empty, loading and error primitives plus the input contract."
      />

      <Section
        title="Surface states"
        description="One surface, four phases. Each state is the shared primitive."
        actions={
          <Toolbar>
            {PHASES.map((p) => (
              <Button
                key={p.value}
                variant={phase === p.value ? "primary" : "secondary"}
                size="sm"
                onClick={() => setPhase(p.value)}
              >
                {p.label}
              </Button>
            ))}
          </Toolbar>
        }
      >
        <Card>
          {phase === "ready" && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--v8-space-2)",
              }}
            >
              {DEMO_CHECKINS.map((row) => (
                <div
                  key={row.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "var(--v8-space-3)",
                    minBlockSize: "var(--v8-data-row-height)",
                  }}
                >
                  <span>{row.name}</span>
                  <Status
                    tone={row.state === "Complete" ? "positive" : "warning"}
                  >
                    {row.state}
                  </Status>
                </div>
              ))}
            </div>
          )}
          {phase === "empty" && (
            <EmptyState
              icon={<Inbox />}
              title="No check-ins yet"
              description="Check-ins your client sends will appear here."
              action={
                <Button onClick={() => setPhase("ready")}>
                  Add sample check-in
                </Button>
              }
            />
          )}
          {phase === "loading" && (
            <>
              <LoadingState
                label="Loading check-ins"
                description="Fetching the latest entries."
              />
              <Skeleton lines={3} />
            </>
          )}
          {phase === "error" && (
            <ErrorState
              title="Check-ins could not be loaded"
              description="The request failed. Retry to fetch again."
              action={
                <Button onClick={() => setPhase("loading")}>Retry</Button>
              }
            />
          )}
        </Card>
      </Section>

      <Section
        title="Input contract"
        description="Every control is labelled and tabbable in DOM order. Move with Tab only."
      >
        <Card>
          <FormGrid columns={2}>
            <Input
              label="Coach name"
              hint="Shown to your clients."
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
            />
            <Select
              label="Theme"
              options={[
                { value: "dark", label: "Dark" },
                { value: "light", label: "Light" },
              ]}
              value={theme}
              onValueChange={setTheme}
            />
          </FormGrid>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "var(--v8-space-3)",
              marginBlockStart: "var(--v8-space-4)",
            }}
          >
            <Toggle
              label="Check-in notifications"
              description="Email when a client sends a check-in."
              checked={notify}
              onCheckedChange={setNotify}
            />
            <div style={{ display: "flex", gap: "var(--v8-space-2)" }}>
              <IconButton label="Open actions">•</IconButton>
              <Button>Save</Button>
            </div>
          </div>
        </Card>
      </Section>
    </main>
  );
}
