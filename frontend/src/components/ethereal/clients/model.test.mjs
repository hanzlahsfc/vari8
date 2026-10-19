import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";

const source = await readFile(new URL("./model.ts", import.meta.url), "utf8");
const fixture = JSON.parse(
  await readFile(
    new URL("../../../data/mock-data.json", import.meta.url),
    "utf8",
  ),
);
const importBlock =
  /import \{\s*type Client,\s*clientProfile,\s*clients as seedClients,\s*\} from "@\/lib\/coaching-data";/;
assert.match(
  source,
  importBlock,
  "coaching-data import shape changed; update this test shim",
);
const fixtureShim = `const seedClients = ${JSON.stringify(fixture.clients)};\nconst clientProfile = ${JSON.stringify(fixture.clientProfile)};`;
const executableSource = stripTypeScriptTypes(
  source.replace(importBlock, fixtureShim),
  { mode: "strip" },
);
const model = await import(
  `data:text/javascript;base64,${Buffer.from(executableSource).toString("base64")}`
);

const cleanClient = () => ({
  ...model.createInitialClients().find((client) => client.id === "client-003"),
  checkInStatus: "on track",
  unreadCount: 0,
  overdueTaskCount: 0,
  trainingFlags: 0,
  clientTasks: [],
  coachTasks: [],
  checkIns: [],
});

test("each client collection is a deep independent copy of the fixtures", () => {
  const first = model.createInitialClients();
  first[0].internalNotes[0].text = "Changed in this view";
  first[0].clientTasks[0].title = "Changed task";
  first[0].weightTrend[0].kg = -1;

  const second = model.createInitialClients();
  assert.notEqual(first[0], second[0]);
  assert.notEqual(first[0].internalNotes, second[0].internalNotes);
  assert.equal(
    second[0].internalNotes[0].text,
    "Review split-squat setup before increasing load.",
  );
  assert.equal(second[0].clientTasks[0].title, "Upload training log");
  assert.equal(second[0].weightTrend[0].kg, 72.5);
});

test("overdue task totals match each client's actual task statuses", () => {
  for (const client of model.createInitialClients()) {
    assert.equal(
      client.overdueTaskCount,
      client.clientTasks.filter((task) => task.status === "overdue").length,
      client.name,
    );
  }
});

test("open and overdue client tasks need attention even with clear roster counters", () => {
  const client = cleanClient();
  client.clientTasks = [
    { id: "pending", title: "Send log", dueDate: "2026-10-06", status: "open" },
  ];

  assert.equal(model.needsAttention(client), true);
  assert.equal(model.attentionCount(client), 1);

  client.clientTasks.push({
    id: "late",
    title: "Upload photos",
    dueDate: "2026-10-04",
    status: "overdue",
  });
  assert.equal(model.attentionCount(client), 2);
});

test("awaiting check-in history is the source of truth instead of a stale status label", () => {
  const awaiting = cleanClient();
  awaiting.checkInStatus = "on track";
  awaiting.checkIns = [
    {
      id: "pending",
      date: "2026-10-05",
      status: "awaiting feedback",
      summary: "Review",
      feedback: "",
    },
  ];
  assert.equal(model.needsAttention(awaiting), true);
  assert.equal(model.attentionCount(awaiting), 1);
  assert.equal(model.statusLabel(awaiting), "Awaiting feedback");

  const stale = cleanClient();
  stale.checkInStatus = "awaiting feedback";
  stale.checkIns = [
    {
      id: "sent",
      date: "2026-10-02",
      status: "feedback sent",
      summary: "Reviewed",
      feedback: "Done",
    },
  ];
  assert.equal(model.needsAttention(stale), false);
  assert.equal(model.attentionCount(stale), 0);
  assert.equal(model.statusLabel(stale), "On track");
});

test("completed client tasks and incomplete coach tasks do not create attention", () => {
  const client = cleanClient();
  client.clientTasks = [
    {
      id: "done",
      title: "Log meals",
      dueDate: "2026-10-04",
      status: "complete",
    },
  ];
  client.coachTasks = [{ id: "coach", title: "Review plan", complete: false }];

  assert.equal(model.needsAttention(client), false);
  assert.equal(model.attentionCount(client), 0);
});

test("client dates format consistently and malformed dates remain unchanged", () => {
  assert.equal(model.formatClientDate("2026-10-05"), "5 Oct");
  assert.equal(model.formatClientDate("2026-10-05T08:42"), "5 Oct");
  assert.equal(model.formatClientDate("2026-02-30"), "2026-02-30");
  assert.equal(model.formatClientDate("not-a-date"), "not-a-date");
});
