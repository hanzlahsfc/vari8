import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";

// Load model.ts the same way model.test.mjs does: strip types, replace the
// legacy-clients import with seeded fixtures and point the remaining imports
// at module URLs.
const fixture = JSON.parse(
  await readFile(new URL("../../data/mock-data.json", import.meta.url), "utf8"),
);
const legacySource = await readFile(
  new URL("../ethereal/clients/model.ts", import.meta.url),
  "utf8",
);
const legacyExecutable = stripTypeScriptTypes(
  legacySource.replace(
    /import \{[\s\S]*?\} from "@\/lib\/coaching-data";/,
    `const seedClients = ${JSON.stringify(fixture.clients)}; const clientProfile = ${JSON.stringify(fixture.clientProfile)};`,
  ),
  { mode: "strip" },
);
const legacy = await import(
  `data:text/javascript;base64,${Buffer.from(legacyExecutable).toString("base64")}`
);
const asModule = (code) =>
  `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
const builderModel = asModule(
  stripTypeScriptTypes(
    await readFile(
      new URL("../ethereal/builder/model.ts", import.meta.url),
      "utf8",
    ),
    { mode: "strip" },
  ),
);
const builderGrid = asModule(
  stripTypeScriptTypes(
    await readFile(
      new URL("../ethereal/builder/grid.ts", import.meta.url),
      "utf8",
    ),
    { mode: "strip" },
  ),
);
const schemaSource = stripTypeScriptTypes(
  await readFile(new URL("./builder/schema.ts", import.meta.url), "utf8"),
  { mode: "strip" },
)
  .replaceAll('"./model"', JSON.stringify(builderModel))
  .replaceAll('"./grid"', JSON.stringify(builderGrid));
const source = await readFile(new URL("./model.ts", import.meta.url), "utf8");
const shimmed = source.replace(
  /import \{[^}]*\} from "..\/ethereal\/clients\/model";/,
  `const createInitialClients = () => (${JSON.stringify(legacy.createInitialClients())});`,
);
const domainUrl = new URL("./plans/domain.ts", import.meta.url).href;
const targetsUrl = new URL("./targets/model.ts", import.meta.url).href;
const executable = stripTypeScriptTypes(shimmed, { mode: "strip" })
  .replaceAll('"./builder/schema"', JSON.stringify(asModule(schemaSource)))
  .replaceAll('"./plans/domain"', JSON.stringify(domainUrl))
  .replaceAll('"./targets/model"', JSON.stringify(targetsUrl));
const m = await import(asModule(executable));

// coach-theme.ts only needs react-style hooks for useSystemMode and the
// theme builders for coachThemeStyle; the pure resolution helpers under test
// use neither, so tiny stubs are enough.
const reactStub = asModule(
  `export const useState = (v) => [typeof v === "function" ? v() : v, () => {}];
   export const useEffect = () => {};`,
);
const themeSource = stripTypeScriptTypes(
  await readFile(new URL("./coach-theme.ts", import.meta.url), "utf8"),
  { mode: "strip" },
)
  .replaceAll('"react"', JSON.stringify(reactStub))
  .replaceAll(
    '"@/lib/ethereal-appearance"',
    JSON.stringify(asModule("export const themeVariables = () => ({});")),
  )
  .replaceAll(
    '"@/lib/vari8-theme"',
    JSON.stringify(asModule("export const vari8Theme = () => ({});")),
  )
  .replaceAll(
    '"./accent-contrast"',
    JSON.stringify(
      asModule(
        'export const accentControlColors = () => ({}); export const DEFAULT_ACCENT = "#C9CCD3";',
      ),
    ),
  );
const theme = await import(asModule(themeSource));
// accent-contrast.ts is dependency-free: test its real exports.
const accentContrast = await import(
  asModule(
    stripTypeScriptTypes(
      await readFile(new URL("./accent-contrast.ts", import.meta.url), "utf8"),
      { mode: "strip" },
    ),
  )
);

const tinyPng =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

test("legacy workspaces without any new preference fields load unchanged", () => {
  const a = m.seedState();
  const legacy = { ...a, preferences: { ...a.preferences } };
  for (const key of ["profile", "brand", "followSystemMode", "notify"])
    delete legacy.preferences[key];
  legacy.clients = a.clients.map(({ appMode, ...client }) => client);
  assert.equal(m.isCoachState(legacy), true);
  assert.equal(m.isCoachState(JSON.parse(JSON.stringify(legacy))), true);
  // The guard reports the data as-is; it does not invent defaults.
  assert.equal(legacy.preferences.profile, undefined);
  assert.equal(legacy.preferences.brand, undefined);
  assert.equal(legacy.preferences.followSystemMode, undefined);
  assert.equal(legacy.preferences.notify, undefined);
  assert.equal(legacy.clients[0].appMode, undefined);
});

test("optional settings fields validate and round-trip; invalid values are rejected", () => {
  const a = m.seedState();
  const photo = { name: "coach.png", dataUrl: tinyPng };
  const rich = {
    ...a,
    preferences: {
      ...a.preferences,
      profile: {
        name: "Rae Okonkwo",
        title: "Prep coach",
        photo,
        intro: "Here to help.",
      },
      brand: {
        name: "Rae Coaching",
        logoLight: photo,
      },
      followSystemMode: true,
      notify: { checkIns: false, taskReminders: true },
    },
    clients: a.clients.map((client, i) =>
      i === 0 ? { ...client, appMode: "light" } : client,
    ),
  };
  assert.equal(m.isCoachState(rich), true);
  const round = JSON.parse(JSON.stringify(rich));
  assert.equal(m.isCoachState(round), true);
  assert.equal(round.preferences.profile.name, "Rae Okonkwo");
  assert.equal(round.preferences.brand.logoLight.dataUrl, tinyPng);
  assert.equal(round.preferences.followSystemMode, true);
  assert.equal(round.preferences.notify.checkIns, false);
  assert.equal(round.clients[0].appMode, "light");
  const bad = [
    { ...a, preferences: { ...a.preferences, profile: { name: 7 } } },
    { ...a, preferences: { ...a.preferences, profile: "name" } },
    {
      ...a,
      preferences: {
        ...a.preferences,
        brand: { logoLight: { name: "x.png", dataUrl: "https://x/y.png" } },
      },
    },
    { ...a, preferences: { ...a.preferences, followSystemMode: "yes" } },
    { ...a, preferences: { ...a.preferences, notify: { checkIns: "no" } } },
    {
      ...a,
      clients: a.clients.map((c, i) =>
        i === 0 ? { ...c, appMode: "auto" } : c,
      ),
    },
  ];
  for (const candidate of bad)
    assert.equal(
      m.isCoachState(candidate),
      false,
      JSON.stringify(candidate).slice(0, 80),
    );
});

test("seed and demo reset use Platinum while saved accents survive untouched", () => {
  const seed = m.seedState();
  assert.equal(seed.preferences.accent, "#C9CCD3");
  assert.equal(theme.DEFAULT_ACCENT, "#C9CCD3");
  // A workspace saved before Platinum keeps its accent exactly.
  for (const saved of ["#EB91B8", "#12A594", "#3E63DD"]) {
    const state = {
      ...seed,
      preferences: { ...seed.preferences, accent: saved },
    };
    assert.equal(m.isCoachState(state), true);
    const round = JSON.parse(JSON.stringify(state));
    assert.equal(round.preferences.accent, saved);
  }
});

test("coach mode resolves independently of athlete app mode", () => {
  const prefs = {
    mode: "dark",
    followSystemMode: false,
  };
  assert.equal(theme.coachMode(prefs, "light"), "dark");
  assert.equal(
    theme.coachMode({ ...prefs, followSystemMode: true }, "light"),
    "light",
  );
  // The athlete's own choice wins over the phone; without one the phone decides.
  assert.equal(theme.athleteMode({ appMode: "light" }, "dark"), "light");
  assert.equal(theme.athleteMode({ appMode: "dark" }, "light"), "dark");
  assert.equal(theme.athleteMode({}, "dark"), "dark");
  assert.equal(theme.athleteMode({}, "light"), "light");
});

test("logo resolution picks the light logo on light surfaces and falls back", () => {
  const dark = { name: "dark.png", dataUrl: "data:image/png;base64,AAAA" };
  const light = { name: "light.png", dataUrl: "data:image/png;base64,BBBB" };
  const prefs = { logo: dark, brand: { logoLight: light } };
  assert.equal(theme.logoForMode(prefs, "dark"), dark);
  assert.equal(theme.logoForMode(prefs, "light"), light);
  assert.equal(theme.logoForMode({ logo: dark }, "light"), dark);
  assert.equal(theme.logoForMode({ logo: dark }, "dark"), dark);
  assert.equal(theme.logoForMode({}, "dark"), undefined);
});

test("priority messages first lifts flagged conversations, recency tiebreaks", () => {
  const a = m.seedState();
  const [one, two, three] = a.clients.filter((c) => !c.archived);
  const message = (clientId, date, priority = false) => ({
    id: `t-${clientId}`,
    clientId,
    from: "client",
    date,
    text: "x",
    read: true,
    priority,
  });
  const state = {
    ...a,
    clients: a.clients.map((c) =>
      c.id === one.id || c.id === two.id || c.id === three.id
        ? c
        : { ...c, archived: true },
    ),
    messages: [
      message(one.id, "2026-10-01T09:00:00Z"),
      message(two.id, "2026-10-03T09:00:00Z", true),
      message(three.id, "2026-10-02T09:00:00Z"),
    ],
    preferences: { ...a.preferences, priorityNotifications: true },
  };
  assert.deepEqual(
    m.sortedConversationClients(state).map((c) => c.id),
    [two.id, three.id, one.id],
  );
  const off = {
    ...state,
    preferences: { ...state.preferences, priorityNotifications: false },
  };
  assert.deepEqual(
    m.sortedConversationClients(off).map((c) => c.id),
    [two.id, three.id, one.id],
  );
  // With the flag off the same messages order purely by recency.
  const older = {
    ...state,
    messages: [
      message(one.id, "2026-10-01T09:00:00Z"),
      message(two.id, "2026-10-01T09:00:00Z", true),
      message(three.id, "2026-10-02T09:00:00Z"),
    ],
    preferences: { ...state.preferences, priorityNotifications: false },
  };
  assert.deepEqual(
    m.sortedConversationClients(older).map((c) => c.id),
    [three.id, one.id, two.id],
  );
});

// --- P808 review repairs -----------------------------------------------------
// Pure tab resolution (settings/tabs.ts has no React deps).

const tabsSource = stripTypeScriptTypes(
  await readFile(new URL("./settings/tabs.ts", import.meta.url), "utf8"),
  { mode: "strip" },
);
const tabs = await import(asModule(tabsSource));

test("invalid and missing tabs resolve the same way nav, breadcrumb and content do", () => {
  // Other layouts always land on a category, Profile when none applies.
  assert.equal(tabs.resolveSettingsTab(undefined, false), "profile");
  assert.equal(tabs.resolveSettingsTab("bogus", false), "profile");
  assert.equal(tabs.resolveSettingsTab("branding", false), "branding");
  // The phone shows the category index until a valid category is chosen.
  assert.equal(tabs.resolveSettingsTab(undefined, true), null);
  assert.equal(tabs.resolveSettingsTab("bogus", true), null);
  assert.equal(tabs.resolveSettingsTab("data", true), "data");
  assert.equal(tabs.settingsTabLabel("branding"), "Branding");
  assert.equal(tabs.isSettingsTab("profile"), true);
  assert.equal(tabs.isSettingsTab("templates"), false);
});

test("coach and shared theme defaults stay separate", async () => {
  // The coach default is Platinum and invalid accents fall back to it; the
  // shared vari8-theme module keeps its own legacy fallback for non-coach
  // surfaces (source inspection — the constant is not exported).
  assert.equal(accentContrast.DEFAULT_ACCENT, "#C9CCD3");
  assert.equal(
    accentContrast.accentControlColors("nope").background,
    "#C9CCD3",
  );
  const src = await readFile(
    new URL("../../lib/vari8-theme.ts", import.meta.url),
    "utf8",
  );
  assert.match(src, /FALLBACK_ACCENT = "#EB91B8"/);
});

test("the existing availability value round-trips to its Messages consumer", async () => {
  const a = m.seedState();
  const edited = {
    ...a,
    preferences: { ...a.preferences, availability: "Replies within a day" },
  };
  assert.equal(m.isCoachState(edited), true);
  const round = JSON.parse(JSON.stringify(edited));
  assert.equal(round.preferences.availability, "Replies within a day");
  // Source inspection: the coach Messages caption still renders the field
  // the settings field writes, and the athlete header no longer does
  // (deferred to Phase 1b).
  const src = await readFile(
    new URL("./messages.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    src,
    /preferences\.availability/,
    "messages.tsx no longer reads preferences.availability",
  );
  const athlete = await readFile(
    new URL("../client-app/mobile/messages.tsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    athlete,
    /preferences\.availability/,
    "athlete Messages header still reads preferences.availability",
  );
});

// --- P810 review repairs -----------------------------------------------------
// committed.ts is the pure reconciliation model behind CommittedInput.

const committed = await import(
  asModule(
    stripTypeScriptTypes(
      await readFile(
        new URL("./settings/committed.ts", import.meta.url),
        "utf8",
      ),
      { mode: "strip" },
    ),
  )
);
const { decideCommit, acknowledgeValue } = committed;
const NAME_NORM = (v) => v.trim() || "Liliana Mansfeld";

test("normalized Enter commit then a newer edit still saves", () => {
  // The reported P809 sequence: type "Liliana ", Enter, keep editing to
  // "LilianaX", blur — the second edit must still save.
  const enter = decideCommit({
    draft: "Liliana ",
    value: "Liliana Mansfeld",
    lastSent: null,
    external: false,
    normalize: NAME_NORM,
  });
  assert.deepEqual(enter, { action: "save", submitted: "Liliana" });
  const lastSent = enter.submitted;
  // The stored write echoes back through props and is recognised as ours.
  assert.equal(
    acknowledgeValue({ value: "Liliana", lastSent, focused: true }).kind,
    "own",
  );
  const blur = decideCommit({
    draft: "LilianaX",
    value: "Liliana",
    lastSent: null,
    external: false,
    normalize: NAME_NORM,
  });
  assert.deepEqual(blur, { action: "save", submitted: "LilianaX" });
});

test("debounced normalization including an empty draft that falls back", () => {
  const emptied = decideCommit({
    draft: "   ",
    value: "Rae Okonkwo",
    lastSent: null,
    external: false,
    normalize: NAME_NORM,
  });
  assert.deepEqual(emptied, {
    action: "save",
    submitted: "Liliana Mansfeld",
  });
  // The echo of that default acknowledges normally.
  assert.equal(
    acknowledgeValue({
      value: "Liliana Mansfeld",
      lastSent: emptied.submitted,
      focused: false,
    }).kind,
    "own",
  );
  // A newer edit after that echo still saves.
  const newer = decideCommit({
    draft: "Rae O",
    value: "Liliana Mansfeld",
    lastSent: null,
    external: false,
    normalize: NAME_NORM,
  });
  assert.equal(newer.action, "save");
});

test("Enter then blur with no further edit saves exactly once", () => {
  const enter = decideCommit({
    draft: "Liliana ",
    value: "Liliana Mansfeld",
    lastSent: null,
    external: false,
    normalize: NAME_NORM,
  });
  assert.equal(enter.action, "save");
  // Before the echo arrives, blur submits nothing new — the draft
  // normalizes to what we already sent.
  const blurBeforeEcho = decideCommit({
    draft: "Liliana ",
    value: "Liliana Mansfeld",
    lastSent: enter.submitted,
    external: false,
    normalize: NAME_NORM,
  });
  assert.equal(blurBeforeEcho.action, "noop");
  // After the echo, blur is a noop against the acknowledged value.
  const blurAfterEcho = decideCommit({
    draft: "Liliana ",
    value: "Liliana",
    lastSent: null,
    external: false,
    normalize: NAME_NORM,
  });
  assert.equal(blurAfterEcho.action, "noop");
});

test("an unchanged normalized value never triggers a duplicate save", () => {
  const out = decideCommit({
    draft: "  Liliana Mansfeld  ",
    value: "Liliana Mansfeld",
    lastSent: null,
    external: false,
    normalize: NAME_NORM,
  });
  assert.equal(out.action, "noop");
});

test("an external update or reset is never overwritten by an older draft", () => {
  // Focused field, stored value changes to something we did not send.
  assert.equal(
    acknowledgeValue({
      value: "Rae Okonkwo",
      lastSent: "Liliana",
      focused: true,
    }).kind,
    "external",
  );
  const out = decideCommit({
    draft: "LilianaX",
    value: "Rae Okonkwo",
    lastSent: "Liliana",
    external: true,
    normalize: NAME_NORM,
  });
  assert.equal(out.action, "discard");
  // Unfocused fields resync instead of flagging the draft stale.
  assert.equal(
    acknowledgeValue({
      value: "Rae Okonkwo",
      lastSent: "Liliana",
      focused: false,
    }).kind,
    "resync",
  );
});

/* ------------------------------------------------------------------ */
/* Phase 1b: region, working hours, deadline, replies                  */
/* ------------------------------------------------------------------ */

test("legacy workspaces without Phase 1b fields keep defaults", () => {
  const a = m.seedState();
  const legacy = { ...a, preferences: { ...a.preferences } };
  for (const key of [
    "region",
    "workingHours",
    "availabilityNote",
    "rules",
    "savedReplies",
  ])
    delete legacy.preferences[key];
  assert.equal(m.isCoachState(legacy), true);
  assert.equal(m.resolvedTimeZone(legacy.preferences), "Europe/Vienna");
  assert.equal(m.checkInDeadline(legacy.preferences), "23:59");
  assert.equal(m.resolvedWorkingHours(legacy.preferences).length, 5);
  assert.deepEqual(
    m.savedReplyTexts(legacy.preferences),
    m.DEFAULT_SAVED_REPLIES,
  );
});

test("date-only values never shift with the configured time zone", () => {
  for (const zone of [
    "Europe/Vienna",
    "America/New_York",
    "Pacific/Auckland",
    "Pacific/Kiritimati",
  ]) {
    m.setDisplayConfig({ timeZone: zone });
    assert.equal(m.formatDate("2026-10-13"), m.formatDate("2026-10-13"));
    // The rendered calendar day stays the 13th everywhere.
    assert.match(m.formatDate("2026-10-13"), /13/);
    // Naive message stamps keep their coach-zone wall time in every zone.
    assert.match(
      m.formatDate("2026-10-05T08:47", { hour: "2-digit", minute: "2-digit" }),
      /08:47/,
    );
  }
  m.setDisplayConfig({ timeZone: "Europe/Vienna" });
});

test("real instants with offsets format in the configured zone", () => {
  m.setDisplayConfig({ timeZone: "Europe/Vienna" });
  const out = m.formatDate("2026-10-13T18:30:00Z", {
    hour: "2-digit",
    minute: "2-digit",
  });
  assert.match(out, /20:30/); // 18:30 UTC = 20:30 CEST
  m.setDisplayConfig({ timeZone: "America/New_York" });
  assert.match(
    m.formatDate("2026-10-13T18:30:00Z", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    /14:30/, // 18:30 UTC = 14:30 EDT
  );
  m.setDisplayConfig({ timeZone: "Europe/Vienna" });
});

test("deadline instant resolves across zones and DST", () => {
  // 20:00 on 2026-10-13 in Vienna (CEST, UTC+2) is 18:00 UTC.
  assert.equal(
    new Date(
      m.deadlineInstant("2026-10-13", "20:00", "Europe/Vienna"),
    ).toISOString(),
    "2026-10-13T18:00:00.000Z",
  );
  // Same wall time in New York (EDT, UTC-4) is 00:00 UTC next day.
  assert.equal(
    new Date(
      m.deadlineInstant("2026-10-13", "20:00", "America/New_York"),
    ).toISOString(),
    "2026-10-14T00:00:00.000Z",
  );
  // DST switch weekend (US falls back 2026-11-01): 01:30 exists twice; the
  // convergent solver must still land inside the day at a valid instant.
  const dst = m.deadlineInstant("2026-11-01", "09:00", "America/New_York");
  assert.equal(new Date(dst).toISOString(), "2026-11-01T14:00:00.000Z");
  // Europe spring forward gap (2026-03-29 02:00 missing in Vienna).
  const gap = m.deadlineInstant("2026-03-29", "09:00", "Europe/Vienna");
  assert.equal(new Date(gap).toISOString(), "2026-03-29T07:00:00.000Z");
});

test("check-in overdue honours the configured deadline and zone", () => {
  const prefs = {
    region: { timeZone: "Europe/Vienna" },
    rules: { checkInDeadline: "20:00" },
  };
  // 19:59 Vienna on the day -> not overdue; 20:01 -> overdue.
  const before = new Date("2026-10-13T17:59:00Z"); // 19:59 CEST
  const after = new Date("2026-10-13T18:01:00Z"); // 20:01 CEST
  assert.equal(m.isCheckInOverdue(prefs, "2026-10-13", before), false);
  assert.equal(m.isCheckInOverdue(prefs, "2026-10-13", after), true);
  // A far-ahead zone sees the day end sooner: Auckland (UTC+13) 20:00 is
  // 07:00 UTC, already past at 18:01 UTC.
  const auckland = {
    region: { timeZone: "Pacific/Auckland" },
    rules: { checkInDeadline: "20:00" },
  };
  assert.equal(m.isCheckInOverdue(auckland, "2026-10-13", after), true);
  // Legacy 23:59 keeps the day open almost until midnight.
  const legacy = { region: { timeZone: "Europe/Vienna" } };
  assert.equal(m.isCheckInOverdue(legacy, "2026-10-13", after), false);
});

test("working hours validation catches bad ranges and empty weeks", () => {
  const ok = [
    {
      weekday: 0,
      ranges: [
        { start: "09:00", end: "12:00" },
        { start: "14:00", end: "18:00" },
      ],
    },
  ];
  assert.deepEqual(m.validateWorkingHours(ok), { days: {} });
  const flipped = [{ weekday: 0, ranges: [{ start: "18:00", end: "09:00" }] }];
  assert.equal(
    m.validateWorkingHours(flipped).days[0],
    "End must be after start.",
  );
  const overlap = [
    {
      weekday: 0,
      ranges: [
        { start: "09:00", end: "13:00" },
        { start: "12:00", end: "15:00" },
      ],
    },
  ];
  assert.equal(
    m.validateWorkingHours(overlap).days[0],
    "Ranges must not overlap.",
  );
  const adjacent = [
    {
      weekday: 0,
      ranges: [
        { start: "09:00", end: "12:00" },
        { start: "12:00", end: "15:00" },
      ],
    },
  ];
  assert.deepEqual(m.validateWorkingHours(adjacent), { days: {} });
  assert.equal(
    m.validateWorkingHours([]).week,
    "Add at least one working day.",
  );
});

test("isWithinWorkingHours and working-day feedback count zone windows", () => {
  const hours = [
    { weekday: 0, ranges: [{ start: "09:00", end: "18:00" }] }, // Monday
    { weekday: 2, ranges: [{ start: "09:00", end: "12:00" }] }, // Wednesday
  ];
  const zone = "Europe/Vienna";
  // Monday 2026-10-12 10:00 CEST = 08:00 UTC -> inside; 19:00 -> outside.
  assert.equal(
    m.isWithinWorkingHours(hours, Date.parse("2026-10-12T08:00:00Z"), zone),
    true,
  );
  assert.equal(
    m.isWithinWorkingHours(hours, Date.parse("2026-10-12T17:00:00Z"), zone),
    false,
  );
  // 16 working hours from Monday 10:00 CEST (8h left Mon, 7h Wed morning
  // -> finishes Thursday? no: Mon 8h + Wed 3h + next Mon 5h).
  const due = m.addWorkingHours(
    hours,
    Date.parse("2026-10-12T08:00:00Z"),
    16,
    zone,
  );
  // Mon 09-18 = 9h window, starting 10:00 -> 8h. Wed 09-12 = 3h -> 11h.
  // Next Mon 09-18 needs 5h -> ends next Monday 14:00 CEST = 12:00 UTC.
  assert.equal(new Date(due).toISOString(), "2026-10-19T12:00:00.000Z");
});

test("feedback chip honours 24h/48h/working-days/none", () => {
  const prefs = {
    region: { timeZone: "Europe/Vienna" },
    rules: { feedbackTarget: "48h" },
    workingHours: [0, 1, 2, 3, 4].map((weekday) => ({
      weekday,
      ranges: [{ start: "09:00", end: "18:00" }],
    })),
  };
  const submission = {
    date: "2026-10-11",
    submittedAt: "2026-10-11T16:00:00Z",
  };
  // 47 h still to go at +1h.
  const chip = m.feedbackChipText(
    prefs,
    submission,
    new Date("2026-10-11T17:00:00Z"),
  );
  assert.equal(chip.text, "Reply due in 47 h");
  assert.equal(chip.late, false);
  // Past the target -> late.
  const late = m.feedbackChipText(
    prefs,
    submission,
    new Date("2026-10-13T17:00:00Z"),
  );
  assert.equal(late.text, "Late by 1 h");
  // Working-day target pauses outside hours: Sunday 18:00 CEST + 16 wh
  // -> Mon 7h + Tue 8h + Wed 1h = ends Wed 10:00 CEST = 08:00 UTC.
  const wd = m.feedbackDueAt(
    { ...prefs, rules: { feedbackTarget: "2-working-days" } },
    submission,
  );
  assert.equal(new Date(wd).toISOString(), "2026-10-13T14:00:00.000Z");
  // No target -> no chip.
  assert.equal(
    m.feedbackChipText(
      { ...prefs, rules: { feedbackTarget: "none" } },
      submission,
    ),
    null,
  );
});

test("new-template defaults apply units; existing templates keep theirs", () => {
  const lb = m.newTemplate("t1", { bodyWeightUnit: "lb", loadUnit: "lb" });
  const weight = lb.variants[0].fields.find((f) => f.id === "weight");
  assert.equal(weight.unit, "lb");
  assert.equal(lb.variants[0].training.loadUnit, "lb");
  const kg = m.newTemplate("t2");
  assert.equal(kg.variants[0].fields.find((f) => f.id === "weight").unit, "kg");
  assert.equal(kg.variants[0].training.loadUnit, "kg");
  // Seeded templates are untouched.
  const seed = m.seedState();
  assert.equal(
    seed.templates[0].variants[0].fields.find((f) => f.id === "weight").unit,
    "kg",
  );
});

test("saved replies: absent falls back, empty stays empty, list persists", () => {
  assert.deepEqual(m.savedReplyTexts({}), m.DEFAULT_SAVED_REPLIES);
  assert.deepEqual(m.savedReplyTexts({ savedReplies: [] }), []);
  const custom = {
    savedReplies: [
      { id: "r1", text: "First" },
      { id: "r2", text: "Second" },
    ],
  };
  assert.deepEqual(m.savedReplyTexts(custom), ["First", "Second"]);
  // The guard accepts a stored list and rejects malformed entries.
  const a = m.seedState();
  assert.equal(
    m.isCoachState({
      ...a,
      preferences: { ...a.preferences, savedReplies: [] },
    }),
    true,
  );
});

test("athlete availability note migrates only a changed legacy value", () => {
  assert.equal(
    m.athleteAvailabilityNote({ availability: "Weekdays · 09:00–18:00" }),
    "",
  );
  assert.equal(
    m.athleteAvailabilityNote({ availability: "Replies within a day" }),
    "Replies within a day",
  );
  assert.equal(
    m.athleteAvailabilityNote({
      availability: "custom",
      availabilityNote: "note wins",
    }),
    "note wins",
  );
});

test("working hours summary groups consecutive matching days", () => {
  const hours = [
    { weekday: 0, ranges: [{ start: "09:00", end: "18:00" }] },
    { weekday: 1, ranges: [{ start: "09:00", end: "18:00" }] },
    { weekday: 2, ranges: [{ start: "09:00", end: "18:00" }] },
    { weekday: 3, ranges: [{ start: "09:00", end: "18:00" }] },
    { weekday: 4, ranges: [{ start: "09:00", end: "18:00" }] },
    { weekday: 5, ranges: [{ start: "10:00", end: "12:00" }] },
  ];
  assert.equal(
    m.workingHoursSummary(hours, "24"),
    "Mon to Fri, 09:00 to 18:00 · Sat, 10:00 to 12:00",
  );
  assert.equal(
    m.workingHoursSummary(hours, "12"),
    "Mon to Fri, 9:00 AM to 6:00 PM · Sat, 10:00 AM to 12:00 PM",
  );
});
