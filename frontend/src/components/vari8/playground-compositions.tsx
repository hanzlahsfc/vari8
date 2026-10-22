"use client";

import {
  Activity,
  BarChart3,
  ChevronDown,
  ClipboardCheck,
  Settings2,
} from "lucide-react";
import { type FormEvent, useEffect, useId, useState } from "react";
import {
  Button,
  Card,
  Checkbox,
  Input,
  Modal,
  Navigation,
  SegmentedControl,
  Select,
  Status,
  Table,
  Tabs,
  Toggle,
} from "@/components/vari8/components";
import {
  EditorHeader,
  FormGrid,
  PageHeader,
  Section,
  Toolbar,
} from "@/components/vari8/layouts";
import "./playground-compositions.css";

type Panel = "dashboard" | "tracking" | "configuration";
type Entry = {
  week: string;
  date: string;
  completion: number;
  sessions: string;
  sleep: string;
  status: "Complete" | "Reviewed" | "Needs follow-up";
};
type PreviewSettings = {
  weeklyTarget: string;
  reviewDay: string;
  summaryEnabled: boolean;
  coachNoteIncluded: boolean;
  reminderEnabled?: boolean;
  reminderTime?: string;
  includeWeight?: boolean;
};
type DailyDraft = {
  weight: string;
  sleep: string;
  water: string;
  note: string;
  dayType: "training" | "rest";
  movement: "strength" | "cardio" | "walk";
};

const SETTINGS_KEY = "vari8-playground:sample-settings:v1";
const TRACKING_KEY = "vari8-playground:daily-draft:v1";
const initialSettings: PreviewSettings = {
  weeklyTarget: "4",
  reviewDay: "friday",
  summaryEnabled: true,
  coachNoteIncluded: false,
  reminderEnabled: true,
  reminderTime: "08:00",
  includeWeight: true,
};
const emptyDraft: DailyDraft = {
  weight: "68.4",
  sleep: "7.5",
  water: "1.8",
  note: "",
  dayType: "training",
  movement: "strength",
};

const entries: Entry[] = [
  {
    week: "18 Oct",
    date: "18 Oct 2026",
    completion: 86,
    sessions: "4 of 4",
    sleep: "7h 38m",
    status: "Complete",
  },
  {
    week: "11 Oct",
    date: "11 Oct 2026",
    completion: 78,
    sessions: "3 of 4",
    sleep: "7h 12m",
    status: "Reviewed",
  },
  {
    week: "4 Oct",
    date: "4 Oct 2026",
    completion: 81,
    sessions: "4 of 4",
    sleep: "7h 22m",
    status: "Complete",
  },
  {
    week: "27 Sep",
    date: "27 Sep 2026",
    completion: 72,
    sessions: "3 of 4",
    sleep: "6h 55m",
    status: "Reviewed",
  },
  {
    week: "20 Sep",
    date: "20 Sep 2026",
    completion: 67,
    sessions: "2 of 4",
    sleep: "7h 01m",
    status: "Needs follow-up",
  },
  {
    week: "13 Sep",
    date: "13 Sep 2026",
    completion: 62,
    sessions: "3 of 4",
    sleep: "6h 49m",
    status: "Complete",
  },
  {
    week: "6 Sep",
    date: "6 Sep 2026",
    completion: 64,
    sessions: "3 of 4",
    sleep: "6h 54m",
    status: "Reviewed",
  },
  {
    week: "30 Aug",
    date: "30 Aug 2026",
    completion: 58,
    sessions: "2 of 4",
    sleep: "6h 42m",
    status: "Reviewed",
  },
];

function readSettings(): PreviewSettings {
  try {
    const value: unknown = JSON.parse(
      window.localStorage.getItem(SETTINGS_KEY) ?? "null",
    );
    if (typeof value !== "object" || value === null) return initialSettings;
    const record = value as Partial<PreviewSettings>;
    if (
      typeof record.weeklyTarget !== "string" ||
      typeof record.reviewDay !== "string" ||
      typeof record.summaryEnabled !== "boolean" ||
      typeof record.coachNoteIncluded !== "boolean"
    )
      return initialSettings;
    if (!["monday", "wednesday", "friday", "sunday"].includes(record.reviewDay))
      return initialSettings;
    return { ...initialSettings, ...record };
  } catch {
    return initialSettings;
  }
}

function readDailyDraft(): DailyDraft {
  try {
    const value: unknown = JSON.parse(
      window.localStorage.getItem(TRACKING_KEY) ?? "null",
    );
    if (typeof value !== "object" || value === null) return emptyDraft;
    const record = value as Partial<DailyDraft>;
    if (
      [record.weight, record.sleep, record.water, record.note].some(
        (item) => typeof item !== "string",
      )
    )
      return emptyDraft;
    return {
      weight: record.weight as string,
      sleep: record.sleep as string,
      water: record.water as string,
      note: record.note as string,
      dayType: record.dayType === "rest" ? "rest" : "training",
      movement:
        record.movement === "cardio" || record.movement === "walk"
          ? record.movement
          : "strength",
    };
  } catch {
    return emptyDraft;
  }
}

function trendPath(values: Entry[]) {
  const left = 8;
  const right = 672;
  const top = 0;
  const bottom = 160;
  return values
    .map((entry, index) => {
      const x =
        left + (index / Math.max(1, values.length - 1)) * (right - left);
      const y = bottom - ((entry.completion - 50) / 50) * (bottom - top);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

function TrendChart({ data }: { data: Entry[] }) {
  const chartId = useId();
  const line = trendPath(data);
  const xPositions = data.map(
    (_, index) => 8 + (index / Math.max(1, data.length - 1)) * 664,
  );
  const yTicks = [100, 90, 80, 70, 60, 50];
  const area = `${line} L 672 160 L 8 160 Z`;
  return (
    <figure className="v8-scene-chart">
      <div className="v8-scene-chart__main">
        <div className="v8-scene-chart__y-labels" aria-hidden="true">
          {yTicks.map((tick) => (
            <span key={tick}>{tick}%</span>
          ))}
        </div>
        <svg
          className="v8-scene-chart__plot"
          viewBox="0 0 680 160"
          preserveAspectRatio="none"
          role="img"
          aria-labelledby={`${chartId}-title ${chartId}-description`}
        >
          <title id={`${chartId}-title`}>Weekly check-in completion</title>
          <desc id={`${chartId}-description`}>
            {data.length} weekly completion readings, from {data[0]?.completion}
            % to {data.at(-1)?.completion}%. Vertical scale: 50 to 100 percent.
          </desc>
          <defs>
            <linearGradient id={`${chartId}-area`} x1="0" x2="0" y1="0" y2="1">
              <stop
                offset="0%"
                stopColor="var(--v8-accent-chart-line)"
                stopOpacity="var(--v8-chart-area-opacity)"
              />
              <stop
                offset="100%"
                stopColor="var(--v8-accent-chart-fill)"
                stopOpacity="0.015"
              />
            </linearGradient>
            <mask id={`${chartId}-area-fade`}>
              <linearGradient
                id={`${chartId}-area-fade-gradient`}
                x1="0"
                x2="1"
                y1="0"
                y2="0"
              >
                <stop offset="0%" stopColor="white" />
                <stop offset="88%" stopColor="white" stopOpacity="1" />
                <stop offset="100%" stopColor="white" stopOpacity="0" />
              </linearGradient>
              <rect
                width="100%"
                height="100%"
                fill={`url(#${chartId}-area-fade-gradient)`}
              />
            </mask>
          </defs>
          <path
            className="v8-scene-chart__area"
            d={area}
            fill={`url(#${chartId}-area)`}
            mask={`url(#${chartId}-area-fade)`}
          />
          {yTicks.map((tick, index) => (
            <line
              key={tick}
              className="v8-scene-chart__gridline"
              x1="8"
              x2="672"
              y1={index * 32}
              y2={index * 32}
            />
          ))}
          <path className="v8-scene-chart__line" d={line} />
          {data.map((entry, index) => (
            <circle
              key={entry.date}
              className="v8-scene-chart__point"
              cx={xPositions[index]}
              cy={160 - ((entry.completion - 50) / 50) * 160}
              r="3.5"
            />
          ))}
        </svg>
      </div>
      <div
        className="v8-scene-chart__x-labels"
        style={{
          gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))`,
        }}
        aria-hidden="true"
      >
        {data.map((entry) => (
          <span key={entry.date}>{entry.week}</span>
        ))}
      </div>
      <figcaption>
        Weekly completion (%) · Week ending {data[0]?.date} to{" "}
        {data.at(-1)?.date}
      </figcaption>
    </figure>
  );
}

function statusTone(status: Entry["status"]) {
  return status === "Complete"
    ? "positive"
    : status === "Needs follow-up"
      ? "warning"
      : "neutral";
}

function CheckinTable({ data, label }: { data: Entry[]; label: string }) {
  return (
    <Table
      caption={`Maya Chen · ${label} · illustrative sample`}
      className="v8-scene-table"
      regionLabel={`Maya Chen ${label}; table region`}
    >
      <thead>
        <tr>
          <th scope="col">Week ending</th>
          <th scope="col">Completion</th>
          <th scope="col">Sessions</th>
          <th scope="col">Average sleep</th>
          <th scope="col">Review</th>
        </tr>
      </thead>
      <tbody>
        {data.map((entry) => (
          <tr key={entry.date}>
            <th scope="row">{entry.date}</th>
            <td>{entry.completion}%</td>
            <td>{entry.sessions}</td>
            <td>{entry.sleep}</td>
            <td>
              <Status tone={statusTone(entry.status)}>{entry.status}</Status>
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

function Metric({
  label,
  value,
  detail,
  spotlight = false,
}: {
  label: string;
  value: string;
  detail: string;
  spotlight?: boolean;
}) {
  return (
    <Card
      className="v8-scene-metric"
      size="sm"
      treatment={spotlight ? "spotlight" : "plain"}
    >
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{detail}</span>
    </Card>
  );
}

function DashboardPanel({ onReview }: { onReview: () => void }) {
  const [period, setPeriod] = useState("8");
  const data = entries.slice(0, period === "4" ? 4 : 8);
  const currentCompletion = data[0]?.completion ?? 86;
  return (
    <div className="v8-scene-dashboard">
      <div className="v8-scene-workhead">
        <div>
          <h3>Weekly overview</h3>
          <p>Completion is up 14 points since 20 September.</p>
        </div>
        <div className="v8-scene-workhead__actions">
          <Select
            label="Chart period"
            value={period}
            onValueChange={setPeriod}
            options={[
              { value: "4", label: "4 weeks" },
              { value: "8", label: "8 weeks" },
            ]}
          />
          <Button variant="primary" onClick={onReview}>
            <ClipboardCheck size={15} strokeWidth={1.5} /> Review this week
          </Button>
        </div>
      </div>
      <section
        className="v8-scene-metric-row"
        aria-label="This week at a glance"
      >
        <Metric
          label="Weekly completion"
          value={`${currentCompletion}%`}
          detail="Latest week · target met"
        />
        <Metric
          label="Training sessions"
          value="4/4"
          detail="Weekly target met"
        />
        <Metric
          label="Average sleep"
          value="7h 38m"
          detail="+26 min from last week"
        />
      </section>
      <div className="v8-scene-dashboard__body">
        <Card className="v8-scene-chart-card" treatment="spotlight">
          <div className="v8-scene-card-heading">
            <div>
              <h3>Weekly consistency</h3>
              <p>Check-in completion over {period} weeks</p>
            </div>
            <Status tone="positive">On track</Status>
          </div>
          <TrendChart data={[...data].reverse()} />
        </Card>
        <Card className="v8-scene-agenda">
          <div className="v8-scene-card-heading">
            <div>
              <h3>Coach review</h3>
              <p>Week of 12 October</p>
            </div>
            <span className="v8-scene-agenda-icon">
              <ClipboardCheck size={17} />
            </span>
          </div>
          <p className="v8-scene-agenda__note">
            Evening walks moved earlier. Bedtime stayed within the target window
            on five nights.
          </p>
          <dl>
            <div>
              <dt>Next focus</dt>
              <dd>Recovery routine</dd>
            </div>
            <div>
              <dt>Check-in status</dt>
              <dd>
                <Status tone="positive">Ready to review</Status>
              </dd>
            </div>
          </dl>
          <Button variant="secondary" onClick={onReview}>
            Open weekly review
          </Button>
        </Card>
      </div>
      <section className="v8-scene-records" aria-labelledby="dashboard-records">
        <div className="v8-scene-subheading">
          <div>
            <h3 id="dashboard-records">Recent check-ins</h3>
            <p>Latest readings and review state</p>
          </div>
          <span className="v8-scene-record-count">{data.length} weeks</span>
        </div>
        <CheckinTable data={data.slice(0, 6)} label="weekly check-ins" />
      </section>
    </div>
  );
}

function TrackingPanel() {
  const [dayType, setDayType] = useState<DailyDraft["dayType"]>(
    emptyDraft.dayType,
  );
  const [movement, setMovement] = useState<DailyDraft["movement"]>(
    emptyDraft.movement,
  );
  const [draft, setDraft] = useState(emptyDraft);
  const [saved, setSaved] = useState(false);
  const [historyView, setHistoryView] = useState("today");
  useEffect(() => {
    const savedDraft = readDailyDraft();
    setDraft(savedDraft);
    setDayType(savedDraft.dayType);
    setMovement(savedDraft.movement);
  }, []);
  const update = <Key extends keyof DailyDraft>(
    key: Key,
    value: DailyDraft[Key],
  ) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setSaved(false);
  };
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      window.localStorage.setItem(TRACKING_KEY, JSON.stringify(draft));
    } catch {
      /* Keep this preview usable without storage. */
    }
    setSaved(true);
  };
  const today = (
    <div className="v8-scene-daily-layout">
      <Card className="v8-scene-entry-card">
        <div className="v8-scene-card-heading">
          <div>
            <h3>Daily check-in</h3>
            <p>Monday, 19 October · Add today’s measurements</p>
          </div>
          <Status tone={saved ? "positive" : "neutral"}>
            {saved ? "Saved on this device" : "Draft"}
          </Status>
        </div>
        <form className="v8-scene-entry-form" onSubmit={save}>
          <SegmentedControl
            label="Day type"
            value={dayType}
            onValueChange={(value) => {
              const nextDayType = value === "rest" ? "rest" : "training";
              setDayType(nextDayType);
              update("dayType", nextDayType);
            }}
            options={[
              { value: "training", label: "Training day" },
              { value: "rest", label: "Rest day" },
            ]}
          />
          <div className="v8-scene-form-row">
            <Input
              label="Body weight"
              type="number"
              min="30"
              max="250"
              step="0.1"
              value={draft.weight}
              onChange={(event) => update("weight", event.currentTarget.value)}
              hint="kg"
            />
            <Input
              label="Sleep last night"
              type="number"
              min="0"
              max="24"
              step="0.1"
              value={draft.sleep}
              onChange={(event) => update("sleep", event.currentTarget.value)}
              hint="hours"
            />
            <Input
              label="Water today"
              type="number"
              min="0"
              max="20"
              step="0.1"
              value={draft.water}
              onChange={(event) => update("water", event.currentTarget.value)}
              hint="litres"
            />
            <Select
              label="Movement"
              hint="Choose a session or rest day."
              value={dayType === "rest" ? "none" : movement}
              onValueChange={(value) => {
                if (value === "none") {
                  setDayType("rest");
                  update("dayType", "rest");
                } else {
                  setDayType("training");
                  setMovement(value as DailyDraft["movement"]);
                  update("dayType", "training");
                  update("movement", value as DailyDraft["movement"]);
                }
                setSaved(false);
              }}
              options={[
                { value: "strength", label: "Strength session" },
                { value: "cardio", label: "Cardio session" },
                { value: "walk", label: "Walk / mobility" },
                { value: "none", label: "Rest day" },
              ]}
            />
          </div>
          <Input
            label="How are you feeling?"
            value={draft.note}
            onChange={(event) => update("note", event.currentTarget.value)}
            placeholder="Add a short note for your coach"
          />
          <div className="v8-scene-entry-actions">
            <p role="status" aria-live="polite">
              {saved
                ? "Today’s check-in is saved in this browser preview."
                : "Your entries stay in this browser preview."}
            </p>
            <Button type="submit" variant="primary">
              Save daily check-in
            </Button>
          </div>
        </form>
      </Card>
      <Card className="v8-scene-day-summary">
        <div className="v8-scene-card-heading">
          <div>
            <h3>Today’s progress</h3>
            <p>Your check-in at a glance</p>
          </div>
          <Activity size={18} strokeWidth={1.5} />
        </div>
        <div className="v8-scene-progress">
          <span>Daily completion</span>
          <strong>{saved ? "100%" : "75%"}</strong>
          <div className="v8-scene-progress__track">
            <i style={{ width: saved ? "100%" : "75%" }} />
          </div>
        </div>
        <dl>
          <div>
            <dt>Training plan</dt>
            <dd>
              {dayType === "training"
                ? `${movement === "strength" ? "Strength" : movement === "cardio" ? "Cardio" : "Walk / mobility"} · 45 min`
                : "Recovery day"}
            </dd>
          </div>
          <div>
            <dt>Sleep goal</dt>
            <dd>8 h</dd>
          </div>
          <div>
            <dt>Water goal</dt>
            <dd>2.5 L</dd>
          </div>
        </dl>
        <Status tone={saved ? "positive" : "info"}>
          {saved ? "Check-in complete" : "3 of 4 fields logged"}
        </Status>
      </Card>
    </div>
  );
  const history = (
    <Card className="v8-scene-history-card">
      <div className="v8-scene-card-heading">
        <div>
          <h3>Recent daily entries</h3>
          <p>Measurements saved in this sample preview</p>
        </div>
        <Status>Illustrative data</Status>
      </div>
      <Table
        caption="Maya Chen · recent daily entries · illustrative sample"
        className="v8-scene-table"
        regionLabel="Recent daily entries table"
      >
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Day</th>
            <th scope="col">Weight</th>
            <th scope="col">Sleep</th>
            <th scope="col">Water</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Today</th>
            <td>{dayType === "training" ? "Training" : "Rest"}</td>
            <td>{draft.weight} kg</td>
            <td>{draft.sleep} h</td>
            <td>{draft.water} L</td>
            <td>
              <Status tone={saved ? "positive" : "warning"}>
                {saved ? "Saved" : "Draft"}
              </Status>
            </td>
          </tr>
          <tr>
            <th scope="row">Sun, 18 Oct</th>
            <td>Rest</td>
            <td>68.5 kg</td>
            <td>7.8 h</td>
            <td>2.1 L</td>
            <td>
              <Status tone="positive">Complete</Status>
            </td>
          </tr>
          <tr>
            <th scope="row">Sat, 17 Oct</th>
            <td>Training</td>
            <td>68.6 kg</td>
            <td>7.2 h</td>
            <td>2.4 L</td>
            <td>
              <Status tone="positive">Complete</Status>
            </td>
          </tr>
          <tr>
            <th scope="row">Fri, 16 Oct</th>
            <td>Rest</td>
            <td>68.7 kg</td>
            <td>6.9 h</td>
            <td>1.9 L</td>
            <td>
              <Status tone="neutral">Reviewed</Status>
            </td>
          </tr>
        </tbody>
      </Table>
    </Card>
  );
  return (
    <div className="v8-scene-tracking">
      <div className="v8-scene-workhead">
        <div>
          <h3>Monday, 19 October</h3>
          <p>Capture the small signals that shape a useful weekly review.</p>
        </div>
        <Status tone={saved ? "positive" : "neutral"}>
          {saved ? "Saved" : "In progress"}
        </Status>
      </div>
      <Tabs
        label="Daily tracking views"
        value={historyView}
        onValueChange={setHistoryView}
        className="v8-scene-daily-tabs"
        items={[
          { value: "today", label: "Today", content: today },
          { value: "history", label: "History", content: history },
        ]}
      />
    </div>
  );
}

function ConfigurationPanel() {
  const [settings, setSettings] = useState(initialSettings);
  const [feedback, setFeedback] = useState("");
  useEffect(() => setSettings(readSettings()), []);
  const update = <Key extends keyof PreviewSettings>(
    key: Key,
    value: PreviewSettings[Key],
  ) => {
    setSettings((current) => ({ ...current, [key]: value }));
    setFeedback("");
  };
  const saveSettings = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      setFeedback("Settings saved in this browser preview.");
    } catch {
      setFeedback("Settings applied for this preview session.");
    }
  };
  return (
    <div className="v8-scene-configuration">
      <div className="v8-scene-workhead">
        <div>
          <h3>Review preferences</h3>
          <p>Choose how the illustrative check-in is organised.</p>
        </div>
        <Status>Preview only</Status>
      </div>
      <div className="v8-scene-config-layout">
        <Card className="v8-scene-config-card">
          <div className="v8-scene-card-heading">
            <div>
              <h3>Check-in preferences</h3>
              <p>Changes apply to this browser preview.</p>
            </div>
            <Settings2 size={18} strokeWidth={1.5} />
          </div>
          <form className="v8-scene-config-form" onSubmit={saveSettings}>
            <div className="v8-scene-form-row">
              <Input
                label="Weekly session target"
                type="number"
                min="1"
                max="7"
                required
                value={settings.weeklyTarget}
                onChange={(event) =>
                  update("weeklyTarget", event.currentTarget.value)
                }
                hint="Sessions to plan for each week."
              />
              <Select
                label="Review day"
                value={settings.reviewDay}
                onValueChange={(value) => update("reviewDay", value)}
                options={[
                  { value: "monday", label: "Monday" },
                  { value: "wednesday", label: "Wednesday" },
                  { value: "friday", label: "Friday" },
                  { value: "sunday", label: "Sunday" },
                ]}
                hint="Used in the sample check-in summary."
              />
            </div>
            <div className="v8-scene-config-choices">
              <Toggle
                label="Weekly summary"
                checked={settings.summaryEnabled}
                onCheckedChange={(checked) => update("summaryEnabled", checked)}
                description="Include session and sleep totals."
              />
              <Checkbox
                label="Include coach note"
                checked={settings.coachNoteIncluded}
                onCheckedChange={(checked) =>
                  update("coachNoteIncluded", checked)
                }
                description="Show a short note beside the sample readings."
              />
            </div>
            <details className="v8-scene-disclosure" open>
              <summary>
                <span className="v8-scene-disclosure__copy">
                  Reminder schedule
                  <small>Choose when a sample reminder appears</small>
                </span>
                <ChevronDown
                  className="v8-scene-disclosure__chevron"
                  size={16}
                  aria-hidden="true"
                />
              </summary>
              <div className="v8-scene-disclosure__body">
                <Toggle
                  label="Weekly check-in reminder"
                  checked={settings.reminderEnabled ?? true}
                  onCheckedChange={(checked) =>
                    update("reminderEnabled", checked)
                  }
                  description="A local preview setting only."
                />
                <Input
                  label="Reminder time"
                  type="time"
                  value={settings.reminderTime ?? "08:00"}
                  onChange={(event) =>
                    update("reminderTime", event.currentTarget.value)
                  }
                />
              </div>
            </details>
            <details className="v8-scene-disclosure">
              <summary>
                <span className="v8-scene-disclosure__copy">
                  Advanced options
                  <small>Optional data shown in the sample workspace</small>
                </span>
                <ChevronDown
                  className="v8-scene-disclosure__chevron"
                  size={16}
                  aria-hidden="true"
                />
              </summary>
              <div className="v8-scene-disclosure__body">
                <Checkbox
                  label="Include weight in weekly summary"
                  checked={settings.includeWeight ?? true}
                  onCheckedChange={(checked) =>
                    update("includeWeight", checked)
                  }
                  description="Display the measurement alongside completion and sleep."
                />
              </div>
            </details>
            <div className="v8-scene-config-actions">
              <Button type="submit" variant="primary">
                Save preferences
              </Button>
              <p role="status" aria-live="polite">
                {feedback}
              </p>
            </div>
          </form>
        </Card>
        <aside className="v8-scene-config-aside">
          <Card size="sm" className="v8-scene-config-note">
            <span className="v8-scene-config-note__icon">
              <Settings2 size={17} />
            </span>
            <h3>About this preview</h3>
            <p>
              Maya Chen and all measurements are illustrative. Preferences are
              saved locally and have no effect outside this design system
              preview.
            </p>
            <Status tone="info">Local demo state</Status>
          </Card>
        </aside>
      </div>
    </div>
  );
}

export function CoachingWorkspaceSample() {
  const [activePanel, setActivePanel] = useState<Panel>("dashboard");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewDone, setReviewDone] = useState(false);
  const selectPanel = (value: string) => {
    if (
      value === "dashboard" ||
      value === "tracking" ||
      value === "configuration"
    )
      setActivePanel(value);
  };
  const panels: Record<Panel, { title: string; subtitle: string }> = {
    dashboard: {
      title: "Performance dashboard",
      subtitle: "Weekly overview · 12–18 October 2026",
    },
    tracking: {
      title: "Daily tracking",
      subtitle: "Measurements and check-in history",
    },
    configuration: {
      title: "Configuration",
      subtitle: "Preferences for this sample workspace",
    },
  };
  return (
    <section
      className="v8-scene-window"
      aria-label="Illustrative coaching workspace"
    >
      <aside className="v8-scene-rail">
        <a href="#overview" className="v8-scene-identity">
          <span className="v8-scene-mark" aria-hidden="true">
            v8
          </span>
          <span>
            <strong>VARI8</strong>
          </span>
        </a>
        <Navigation
          className="v8-scene-navigation"
          label="Sample workspace sections"
          items={[
            {
              id: "dashboard",
              label: "Dashboard",
              icon: <BarChart3 size={16} strokeWidth={1.5} />,
            },
            {
              id: "tracking",
              label: "Daily tracking",
              icon: <Activity size={16} strokeWidth={1.5} />,
            },
            {
              id: "configuration",
              label: "Configuration",
              icon: <Settings2 size={16} strokeWidth={1.5} />,
            },
          ]}
          activeId={activePanel}
          onNavigate={selectPanel}
        />
        <div className="v8-scene-client">
          <span className="v8-scene-avatar" aria-hidden="true">
            MC
          </span>
          <span>
            <strong>Maya Chen</strong>
            <small>Illustrative client</small>
          </span>
        </div>
      </aside>
      <div className="v8-scene-main">
        <header className="v8-scene-header">
          <div>
            <h2>{panels[activePanel].title}</h2>
            <p>{panels[activePanel].subtitle}</p>
          </div>
          <div className="v8-scene-header__right">
            <span
              className="v8-scene-avatar v8-scene-avatar--header"
              aria-hidden="true"
            >
              MC
            </span>
            <Status tone="positive">On track</Status>
          </div>
        </header>
        {activePanel === "dashboard" ? (
          <DashboardPanel onReview={() => setReviewOpen(true)} />
        ) : activePanel === "tracking" ? (
          <TrackingPanel />
        ) : (
          <ConfigurationPanel />
        )}
      </div>
      <Modal
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        title={
          reviewDone ? "Review marked complete" : "Weekly review · Maya Chen"
        }
        description="A local interaction in the illustrative preview."
        footer={
          <>
            <Button variant="secondary" onClick={() => setReviewOpen(false)}>
              Close
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setReviewDone(true);
                setReviewOpen(false);
              }}
            >
              Mark review complete
            </Button>
          </>
        }
      >
        <div className="v8-scene-review">
          <Status tone="positive">4 of 4 sessions</Status>
          <p>
            Weekly completion is {entries[0]?.completion ?? 86}%. Sleep averaged
            7h 38m.
          </p>
          <p>
            Coach note: evening walks moved earlier and bedtime stayed within
            the target window on five nights.
          </p>
          {reviewDone && (
            <Status tone="positive">Reviewed in this preview</Status>
          )}
        </div>
      </Modal>
    </section>
  );
}

export function LayoutShowcase() {
  return (
    <div className="v8-layout-showcase">
      <PageHeader
        title="Client roster"
        description="Shared page heading with a responsive action group."
        actions={<Button variant="primary">Add client</Button>}
      >
        <Toolbar aria-label="Roster filters">
          <Input label="Search clients" placeholder="Name or email" />
          <Select
            label="Status"
            defaultValue="active"
            options={[
              { value: "active", label: "Active" },
              { value: "paused", label: "Paused" },
            ]}
          />
        </Toolbar>
      </PageHeader>
      <Section
        title="Profile details"
        description="Form fields collapse to one column when their available width is limited."
      >
        <FormGrid>
          <Input label="Client name" defaultValue="Maya Chen" />
          <Input
            label="Email address"
            type="email"
            defaultValue="maya@example.com"
          />
          <Input
            label="Read-only source"
            defaultValue="Imported record"
            readOnly
          />
          <Input
            label="Unavailable field"
            defaultValue="Archived record"
            disabled
          />
        </FormGrid>
      </Section>
      <EditorHeader
        backHref="#overview"
        context="Nutrition plan · Maya Chen"
        title="Weekly schedule"
        status="All changes saved"
        actions={
          <>
            <Button>Preview</Button>
            <Button variant="primary">Save plan</Button>
          </>
        }
      />
    </div>
  );
}
