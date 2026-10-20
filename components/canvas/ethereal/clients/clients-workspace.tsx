"use client";

import { ArrowLeft, ClipboardList, NotebookPen } from "lucide-react";
import { useEffect, useState } from "react";
import {
  type Invitation,
  loadClientsWorkspace,
  saveClientsWorkspace,
} from "@/components/canvas/data/clients";
import { ClientProfile } from "./client-profile";
import { ClientRoster } from "./client-roster";
import {
  createInitialClients,
  formatClientDate,
  type WorkspaceClient,
} from "./model";
import "./clients-workspace.css";

export function ClientsWorkspace({
  clientId,
  onSelectClient,
}: {
  clientId: string | null;
  onSelectClient: (id: string | null) => void;
}) {
  const [clients, setClients] =
    useState<WorkspaceClient[]>(createInitialClients);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState("");
  const [resetBackup, setResetBackup] = useState<{
    clients: WorkspaceClient[];
    invitations: Invitation[];
  } | null>(null);
  const [tracker, setTracker] = useState(false);
  const client = clients.find((item) => item.id === clientId);

  useEffect(() => {
    try {
      const saved = loadClientsWorkspace();
      if (saved?.clients) setClients(saved.clients);
      if (saved?.invitations) setInvitations(saved.invitations);
    } catch {
      setNotice(
        "Saved demo could not be opened. The example roster is ready to use.",
      );
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      saveClientsWorkspace({ clients, invitations });
    } catch {
      setNotice(
        "Browser storage is unavailable. Changes will last for this session.",
      );
    }
  }, [clients, invitations, ready]);

  function select(id: string | null) {
    setTracker(false);
    onSelectClient(id);
  }
  function update(next: WorkspaceClient) {
    const normalized = {
      ...next,
      overdueTaskCount: next.clientTasks.filter(
        (task) => task.status === "overdue",
      ).length,
    };
    setClients((current) =>
      current.map((item) => (item.id === next.id ? normalized : item)),
    );
  }

  if (!ready)
    return (
      <div className="cw-workspace" role="status">
        Opening client workspace…
      </div>
    );

  return (
    <div className="cw-workspace">
      {clientId && !client ? (
        <section className="cw-missing">
          <h1>Client not found</h1>
          <p>This client isn’t in the local demo roster.</p>
          <button type="button" onClick={() => select(null)}>
            Back to clients
          </button>
        </section>
      ) : client ? (
        tracker ? (
          <section className="cw-tracker">
            <button type="button" onClick={() => setTracker(false)}>
              <ArrowLeft size={16} /> Back to {client.name.split(" ")[0]}’s
              profile
            </button>
            <header>
              <h1>{client.name}’s tracker</h1>
              <p>
                {client.template.replace(/^Forma\s/, "")} ·{" "}
                {client.presentation === "meal_plan"
                  ? "Meal plan"
                  : "Flexible nutrition"}
              </p>
            </header>
            <p className="cw-tracker-note">
              Assigned tracker preview · Example measurements for this client.
              Tracker editing and plan configuration are separate studio
              previews.
            </p>
            <div className="cw-measurements">
              <div>
                <span>Latest bodyweight</span>
                <strong>
                  {client.bodyweightKg} <small>kg</small>
                </strong>
                <span>{formatClientDate(client.bodyweightDate)}</span>
              </div>
              <div>
                <span>Height</span>
                <strong>
                  {client.heightCm} <small>cm</small>
                </strong>
              </div>
              <div>
                <span>Coaching phase</span>
                <strong>{client.phase}</strong>
                <span>Week {client.week}</span>
              </div>
            </div>
            <h2>Recent bodyweight entries</h2>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Bodyweight</th>
                </tr>
              </thead>
              <tbody>
                {client.weightTrend.map((entry) => (
                  <tr key={entry.date}>
                    <td>{formatClientDate(entry.date)}</td>
                    <td>{entry.kg} kg</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <section
              className="cw-shared-notes"
              aria-labelledby="cw-shared-title"
            >
              <header>
                <NotebookPen size={20} aria-hidden="true" />
                <div>
                  <h2 id="cw-shared-title">General notes</h2>
                  <p>Visible to you and your coach</p>
                </div>
              </header>
              {client.generalNotes.length ? (
                <ul>
                  {client.generalNotes.map((note) => (
                    <li key={note.id}>{note.text}</li>
                  ))}
                </ul>
              ) : (
                <p>No shared notes yet.</p>
              )}
            </section>
          </section>
        ) : (
          <ClientProfile
            key={client.id}
            client={client}
            onChange={update}
            onBack={() => select(null)}
            onOpenTracker={() => {
              setTracker(true);
              window.scrollTo({ top: 0, behavior: "instant" });
            }}
          />
        )
      ) : (
        <ClientRoster clients={clients} onOpenClient={select} />
      )}

      {invitations.length > 0 && !clientId && (
        <details className="cw-invitations">
          <summary>
            <ClipboardList size={15} /> Onboarding invitation drafts (
            {invitations.length})
          </summary>
          <ul>
            {invitations.map((item) => (
              <li key={item.email}>
                <span>
                  {item.name} · {item.email}
                </span>
                <span>Not sent</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="cw-demo-row">
        <p className="cw-demo">
          Frontend demo · Changes are saved in this browser. Messages and
          feedback are not delivered.
        </p>
        <button
          type="button"
          className="cw-reset"
          onClick={() => {
            if (resetBackup) {
              setClients(resetBackup.clients);
              setInvitations(resetBackup.invitations);
              setResetBackup(null);
              setNotice("Demo changes restored.");
            } else {
              setResetBackup({ clients, invitations });
              setClients(createInitialClients());
              setInvitations([]);
              select(null);
              setNotice("Example roster restored. You can undo this reset.");
            }
          }}
        >
          {resetBackup ? "Undo reset" : "Reset demo"}
        </button>
      </div>
      <p className="cw-notice" role="status">
        {notice}
      </p>
    </div>
  );
}
