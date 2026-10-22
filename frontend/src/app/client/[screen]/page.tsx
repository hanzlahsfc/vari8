import { notFound } from "next/navigation";
import type { ComponentType } from "react";
import { CheckInScreen } from "@/components/client/check-in";
import { CompetitionScreen } from "@/components/client/competition";
import { type ParsedDemo, parseDemo } from "@/components/client/demo/state";
import { LogbookScreen } from "@/components/client/logbook";
import { MessagesScreen } from "@/components/client/messages";
import { NutritionScreen } from "@/components/client/nutrition";
import { PhotosScreen } from "@/components/client/photos";
import { SettingsScreen } from "@/components/client/settings";
import { ClientShell } from "@/components/client/shell";
import { SupplementsScreen } from "@/components/client/supplements";
import { TasksScreen } from "@/components/client/tasks";
import { TrackerScreen } from "@/components/client/tracker";
import { TrainingScreen } from "@/components/client/training";

const screens: Record<string, ComponentType<{ demo: ParsedDemo }>> = {
  tracker: TrackerScreen,
  logbook: LogbookScreen,
  messages: MessagesScreen,
  tasks: TasksScreen,
  training: TrainingScreen,
  nutrition: NutritionScreen,
  photos: PhotosScreen,
  supplements: SupplementsScreen,
  settings: SettingsScreen,
  "check-in": CheckInScreen,
  competition: CompetitionScreen,
};

export default async function ClientScreenPage({
  params,
  searchParams,
}: {
  params: Promise<{ screen: string }>;
  searchParams: Promise<{ demo?: string | string[] }>;
}) {
  const [{ screen }, { demo }] = await Promise.all([params, searchParams]);
  const Screen = screens[screen];
  if (!Screen) notFound();
  const parsed = parseDemo(demo);
  return (
    <ClientShell screen={screen} demo={parsed}>
      <Screen demo={parsed} />
    </ClientShell>
  );
}
