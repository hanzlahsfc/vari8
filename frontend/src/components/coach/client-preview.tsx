"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ClientApp } from "../client-app/client-app";
import { trackerConfig } from "../client-app/views";
import { SegmentedControl } from "../vari8/components";
import { createExampleClient } from "./client-tracker-preview/example-client";
import { type CoachClient, TODAY } from "./model";
import { useCoach } from "./store";
import { templateSetup } from "./template-setup";
import { Avatar, Empty } from "./ui";
import "./client-preview.css";

export function ClientPreview({
  template,
  client,
  initialTab,
}: {
  template: import("./model").Template;
  client?: CoachClient;
  initialTab?: string;
}) {
  const { state } = useCoach();
  const configuration = client?.assignment
    ? templateSetup(client.assignment.snapshot, client.assignment.variantId)
    : templateSetup(template);
  const athlete = useMemo(() => {
    if (client) return client;
    const sample = state.clients[0];
    return sample
      ? createExampleClient(sample, trackerConfig(configuration), TODAY)
      : undefined;
  }, [client, state.clients, configuration]);
  const [width, setWidth] = useState<"phone" | "desktop">("phone");
  if (!athlete) return <Empty title="No athlete available for preview" />;
  return (
    <div className="cd-full-client-preview">
      <div className="cd-preview-banner">
        <Avatar client={athlete} />
        <div>
          <strong>{athlete.name}</strong>
          <small>
            {client ? "Assigned athlete" : "Sample athlete"} · {template.name}
          </small>
        </div>
        <span className="cd-preview-note">
          {client
            ? "Client preview · changes stay inside preview"
            : "Client preview · 8 weeks of sample tracker data"}
        </span>
        {client && (
          <Link
            className="cd-preview-open-app"
            href={`/client?client=${client.id}`}
            target="_blank"
            rel="noopener"
          >
            Open client app
          </Link>
        )}
      </div>
      <div className="cd-preview-toolbar">
        <SegmentedControl
          label="Preview width"
          value={width}
          onValueChange={(value) => setWidth(value as "phone" | "desktop")}
          options={[
            { value: "phone", label: "Phone" },
            { value: "desktop", label: "Desktop" },
          ]}
        />
      </div>
      <div className="cd-preview-frame" data-width={width}>
        <ClientApp
          configuration={configuration}
          client={athlete}
          context="preview"
          illustrative={!client}
          initialTab={initialTab}
        />
      </div>
    </div>
  );
}
