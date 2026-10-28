"use client";

import { useState } from "react";
import { Checkbox, Input, Select, Toggle } from "@/components/vari8/components";
import {
  DatePicker,
  DateRangePicker,
  DateTimePicker,
  MonthPicker,
  MultiSelect,
  SearchableSelect,
  TextArea,
  TimePicker,
  WeekPicker,
} from "@/components/vari8/inputs";
import "./input-showcase.css";

function Group({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="v8-input-group">
      <h3>{title}</h3>
      <div className="v8-input-grid">{children}</div>
    </div>
  );
}

export function InputShowcase() {
  const [date, setDate] = useState("2026-10-19");
  const [time, setTime] = useState("08:30");
  const [time12, setTime12] = useState("13:05");
  const [start, setStart] = useState("2026-10-19");
  const [end, setEnd] = useState("2026-10-23");
  const [week, setWeek] = useState("2026-W43");
  const [month, setMonth] = useState("2026-10");
  const [dayType, setDayType] = useState("training");
  const [range, setRange] = useState("65");
  const [checked, setChecked] = useState(true);
  const [enabled, setEnabled] = useState(true);
  const [tags, setTags] = useState(["sleep"]);
  const [exercise, setExercise] = useState("strength");
  const [showPassword, setShowPassword] = useState(false);
  return (
    <div className="v8-input-showcase" id="inputs">
      <Group title="Text and numbers">
        <Input label="Name" defaultValue="Maya Chen" required />
        <Input
          label="Email"
          type="email"
          defaultValue="maya@example.com"
          autoComplete="email"
        />
        <div className="v8-password-field">
          <Input
            label="Password"
            type={showPassword ? "text" : "password"}
            defaultValue="sample-password"
          />
          <button
            className="v8-password-toggle"
            type="button"
            aria-pressed={showPassword}
            onClick={() => setShowPassword(!showPassword)}
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
        <Input label="Search" type="search" defaultValue="strength plan" />
        <Input label="Telephone" type="tel" defaultValue="+43 660 123 4567" />
        <Input label="Website" type="url" defaultValue="https://example.org" />
        <Input
          label="Body weight"
          type="number"
          defaultValue="68.4"
          min="30"
          max="250"
          step="0.1"
          hint="kg"
        />
        <SearchableSelect
          label="Search exercises"
          value={exercise}
          onValueChange={setExercise}
          options={[
            { value: "strength", label: "Strength training" },
            { value: "mobility", label: "Mobility" },
            { value: "recovery", label: "Recovery session" },
          ]}
        />
        <div className="v8-native-field v8-native-field--wide">
          <TextArea
            label="Session notes"
            defaultValue="Energy felt steady throughout."
            rows={3}
            hint="Add context for the next review."
          />
        </div>
        <Input
          label="Read-only value"
          defaultValue="Imported from a locked record"
          readOnly
        />
        <Input
          label="Disabled field"
          defaultValue="Unavailable while the plan is paused"
          disabled
        />
        <Input
          label="Required value"
          defaultValue=""
          placeholder="Enter a value"
          required
          error="This field is required."
        />
      </Group>
      <Group title="Date and time">
        <DatePicker
          label="Session date"
          value={date}
          onValueChange={setDate}
          required
          hint="Choose a day from the calendar."
        />
        <TimePicker label="Session time" value={time} onValueChange={setTime} />
        <TimePicker
          label="12-hour display (stored as 24-hour)"
          value={time12}
          onValueChange={setTime12}
          hourFormat="12"
        />
        <DateTimePicker
          date={date}
          time={time}
          onDateChange={setDate}
          onTimeChange={setTime}
        />
        <div className="v8-native-field v8-native-field--wide">
          <span className="v8-field__label">Session date range</span>
          <DateRangePicker
            start={start}
            end={end}
            onStartChange={setStart}
            onEndChange={setEnd}
          />
        </div>
        <MonthPicker
          label="Planning month"
          value={month}
          onValueChange={setMonth}
        />
        <WeekPicker
          label="Review week"
          value={week}
          onValueChange={setWeek}
          hint="ISO weeks start on Monday."
        />
        <DatePicker
          label="Read-only date"
          value={date}
          onValueChange={setDate}
          readOnly
        />
        <TimePicker
          label="Disabled time"
          value={time}
          onValueChange={setTime}
          disabled
        />
      </Group>
      <Group title="Selection">
        <Select
          label="Session type"
          value={dayType}
          onValueChange={setDayType}
          options={[
            { value: "training", label: "Training" },
            { value: "recovery", label: "Recovery" },
            { value: "rest", label: "Rest day" },
          ]}
        />
        <Select
          label="Disabled control"
          value="paused"
          disabled
          options={[
            { value: "paused", label: "Plan paused" },
            { value: "active", label: "Active plan" },
          ]}
        />
        <Select
          label="Read-only control"
          value="active"
          readOnly
          options={[
            { value: "paused", label: "Plan paused" },
            { value: "active", label: "Active plan" },
          ]}
        />
        <fieldset className="v8-native-field">
          <legend className="v8-field__label">Preferred contact</legend>
          <label className="v8-radio-choice">
            <input type="radio" name="v8-contact" defaultChecked /> Email
          </label>
          <label className="v8-radio-choice">
            <input type="radio" name="v8-contact" /> Phone
          </label>
        </fieldset>
        <MultiSelect
          label="Tags"
          value={tags}
          onValueChange={setTags}
          options={[
            { value: "sleep", label: "Sleep" },
            { value: "nutrition", label: "Nutrition" },
            { value: "movement", label: "Movement" },
          ]}
        />
        <MultiSelect
          label="Read-only tags"
          value={tags}
          onValueChange={setTags}
          readOnly
          options={[
            { value: "sleep", label: "Sleep" },
            { value: "nutrition", label: "Nutrition" },
          ]}
        />
        <Checkbox
          label="Include weekly note"
          checked={checked}
          onCheckedChange={setChecked}
          description="Shown in the sample summary."
        />
        <Toggle
          label="Reminder enabled"
          checked={enabled}
          onCheckedChange={setEnabled}
          description="A local preview setting."
        />
      </Group>
      <Group title="Other controls">
        <label className="v8-native-field">
          <span className="v8-field__label">Effort level · {range}</span>
          <input
            className="v8-range"
            type="range"
            min="0"
            max="100"
            value={range}
            onChange={(event) => setRange(event.currentTarget.value)}
          />
        </label>
        <Input label="Choose a color" type="color" defaultValue="#7264d6" />
        <Input label="Attach a file" type="file" accept=".pdf,.jpg,.png" />
      </Group>
      <Group title="Control size parity">
        {(["sm", "md", "lg"] as const).map((size) => (
          <div className="v8-density-sample" key={size}>
            <h4>
              {size === "sm"
                ? "Compact · 32px"
                : size === "md"
                  ? "Default · 40px"
                  : "Large · 48px"}
            </h4>
            <Input label="Text" size={size} defaultValue="Maya Chen" />
            <Select
              label="Selection"
              size={size}
              defaultValue="training"
              options={[
                { value: "training", label: "Training" },
                { value: "recovery", label: "Recovery" },
              ]}
            />
            <SearchableSelect
              label="Search and select"
              size={size}
              value={exercise}
              onValueChange={setExercise}
              options={[
                { value: "strength", label: "Strength training" },
                { value: "mobility", label: "Mobility" },
              ]}
            />
            <MultiSelect
              label="Multiple values"
              size={size}
              value={tags}
              onValueChange={setTags}
              options={[
                { value: "sleep", label: "Sleep" },
                { value: "nutrition", label: "Nutrition" },
              ]}
            />
            <DatePicker
              label="Date"
              size={size}
              value={date}
              onValueChange={setDate}
            />
            <TimePicker
              label="Time"
              size={size}
              value={time}
              onValueChange={setTime}
            />
          </div>
        ))}
      </Group>
    </div>
  );
}
