"use client";

// Card 05a remote surfaces. Under `own` the home dashboard's tasks and
// messages widgets and the tracker section read and write the /api/v1
// own routes instead of canvas fixture records. Every other field of
// SourceRecords stays canvas-model data for this card: competition,
// settings, the nutrition plan view, activity targets and the training
// logbook have no endpoint yet and keep the local path.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  bindDashboardUnits,
  recordsForCoach,
} from "../coach/builder/coach-dashboard";
import { DashboardBuilder } from "../coach/builder/dashboard-builder";
import {
  RemoteConversation,
  useOwnMessages,
} from "../coach/builder/widget-content";
import type {
  ClientMessage,
  ClientTask,
  SourceRecords,
} from "../coach/builder/model";
import { createDashboardDraft } from "../coach/builder/schema";
import type { CoachClient, Variant } from "../coach/model";
import { useCoach } from "../coach/store";
import { useLocalToday } from "../coach/targets/use-local-today";
import type { OwnMessageWire } from "../data/messages";
import {
  fetchOwnTasks,
  type OwnTaskWire,
  setOwnTaskCompletion,
} from "../data/tasks";
import { RemoteClientTracker } from "../ethereal/client-tracker/remote-client-tracker";

type OwnIdentity = { workspaceId: string; clientProfileId: string };

function toClientTask(wire: OwnTaskWire): ClientTask {
  return {
    id: wire.id,
    title: wire.title,
    dueDate: wire.dueDate,
    completed: wire.status === "COMPLETED",
  };
}

function toClientMessage(
  wire: OwnMessageWire,
  clientName: string,
): ClientMessage {
  return {
    id: wire.id,
    date: wire.sentAt.slice(0, 10),
    sender: wire.senderKind === "STAFF" ? "Coach" : clientName,
    excerpt: wire.body,
    // Unread is inbound-only: the wire `read` flag on a CLIENT row is the
    // coach's read marker, never the caller's own — the client's sends
    // never show as inbound unread.
    unread: wire.senderKind === "STAFF" && !wire.read,
  };
}

export function RemoteDashboardTab({
  configuration,
  client,
  own,
}: {
  configuration: Variant;
  client: CoachClient;
  own: OwnIdentity;
}) {
  const { state } = useCoach();
  const baseRecords = useMemo(
    () => recordsForCoach(configuration, client, state),
    [configuration, client, state],
  );
  const dashboard = useMemo(
    () =>
      bindDashboardUnits(
        configuration.dashboard ?? createDashboardDraft(),
        configuration,
      ),
    [configuration],
  );
  const [tasks, setTasks] = useState<OwnTaskWire[] | null>(null);
  const { messages, apply: applyMessages } = useOwnMessages(own.workspaceId);
  useEffect(() => {
    let cancelled = false;
    fetchOwnTasks(own.workspaceId, "both")
      .then((response) => {
        if (!cancelled) setTasks(response.tasks);
      })
      .catch(() => {
        if (!cancelled) setTasks([]);
      });
    return () => {
      cancelled = true;
    };
  }, [own.workspaceId]);
  const records = useMemo<SourceRecords>(
    () => ({
      ...baseRecords,
      // Under own these lists are server truth. Before the fetch resolves
      // they render empty, never fixture rows.
      tasks: (tasks ?? []).map(toClientTask),
      messages: (messages ?? []).map((wire) =>
        toClientMessage(wire, client.name),
      ),
    }),
    [baseRecords, tasks, messages, client.name],
  );
  const onRecordsChange = useCallback(
    (next: SourceRecords) => {
      // Message updates never travel this channel — the composer and read
      // marker report wire snapshots through onMessagesSync directly. Only
      // task completion toggles persist here.
      for (const wire of tasks ?? []) {
        const edited = next.tasks.find((task) => task.id === wire.id);
        if (!edited || edited.completed === (wire.status === "COMPLETED"))
          continue;
        const desired = edited.completed ? "COMPLETED" : "OPEN";
        // Optimistic wire state: the records rebuild reads this same state,
        // so a message resync landing mid-write can never paint the old
        // toggle value back over the pending edit.
        setTasks((current) =>
          (current ?? []).map((task) =>
            task.id === wire.id ? { ...task, status: desired } : task,
          ),
        );
        setOwnTaskCompletion(own.workspaceId, own.clientProfileId, wire.id, {
          desired,
          expectedRevision: wire.revision,
        })
          .then((result) =>
            setTasks((current) =>
              (current ?? []).map((task) =>
                task.id === wire.id
                  ? {
                      ...task,
                      status: result.status,
                      revision: result.revision,
                    }
                  : task,
              ),
            ),
          )
          .catch(() =>
            // A failed write drops back to the last wire truth.
            setTasks((current) =>
              (current ?? []).map((task) =>
                task.id === wire.id ? wire : task,
              ),
            ),
          );
      }
    },
    [own, tasks],
  );
  return (
    <>
      <DashboardBuilder
        value={dashboard}
        onChange={() => undefined}
        sourceRecords={records}
        onRecordsChange={onRecordsChange}
        previewOnly
        workspaceId={own.workspaceId}
        onMessagesSync={applyMessages}
      />
      <RemoteConversation
        workspaceId={own.workspaceId}
        clientName={client.name}
        messages={messages}
        onSync={applyMessages}
        collapsible
      />
    </>
  );
}

/** Card 05a/P625: the coach conversation as its own nav section — the
 *  client's thread stays reachable even when the template assigns no
 *  Dashboard view. */
export function RemoteConversationTab({
  own,
  clientName,
}: {
  own: OwnIdentity;
  clientName: string;
}) {
  return (
    <RemoteConversation workspaceId={own.workspaceId} clientName={clientName} />
  );
}

export function RemoteTrackerTab({
  own,
  clientName,
}: {
  own: OwnIdentity;
  clientName: string;
}) {
  const asOf = useLocalToday();
  const clientInitials = clientName
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <RemoteClientTracker
      workspaceId={own.workspaceId}
      clientProfileId={own.clientProfileId}
      clientName={clientName}
      clientInitials={clientInitials}
      asOf={asOf}
    />
  );
}
