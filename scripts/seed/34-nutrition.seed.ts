import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveLocalInstant } from "../../lib/checkin/timezone";
import type { SeedContext } from "./index";

/**
 * PR-M5 (D29, D34) — nutrition domain demo seed.
 *
 * - Loads the canvas food catalog (`frontend/src/data/food-database.json`,
 *   584 rows) into `nutrition_catalog_item` so portion `foodId`s on seeded
 *   plans resolve for `lib/nutrition/math.ts` totals. Item ids are the
 *   canvas ids verbatim ("food-001" ...); `source_no` uses the 900000
 *   block so the real importer's source numbers never collide.
 * - Assigns the seeded coach (Sofia Miller) PRIMARY on every demo client
 *   and the owner a COACH assignment, matching the canvas demo where one
 *   workspace staff roster coaches all fifteen clients.
 * - Writes one MealPlan for the first canvas client (Emma Anders): an
 *   open draft plus one published immutable version. The payload mirrors
 *   the canvas `createInitialMealPlan` demo plan — variant "TD", the
 *   four default meals with the catalog's preferred foods and portion
 *   quantities — with deterministic ids, so the wiring PR's parity run
 *   compares like with like.
 *
 * Values are synthetic copies of the canvas demo state, never real data.
 * Every write is an idempotent upsert.
 */

const WORKSPACE_SLUG = "canvas-demo";
const COACH_EMAIL_ENV = "SEED_COACH_EMAIL";
const OWNER_EMAIL_ENV = "SEED_OWNER_EMAIL";
const PLAN_TIMEZONE = "Europe/Copenhagen";
const DEMO_CLIENT_NAME = "Emma Anders";
const DEMO_START_DATE = "2026-10-19";
const DEMO_EFFECTIVE_DATE = "2026-10-19";

type CanvasFood = {
  id: string;
  name: string;
  amount: number;
  unit: string;
  protein: number;
  carbs: number;
  fat: number;
  calories: number;
};

function canvasFoods(): CanvasFood[] {
  const dataPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../frontend/src/data/food-database.json",
  );
  const data = JSON.parse(readFileSync(dataPath, "utf8")) as {
    foods?: CanvasFood[];
  };
  const foods = data.foods ?? [];
  if (foods.length === 0)
    throw new Error(`no canvas foods found in ${dataPath}`);
  return foods;
}

function fingerprint(food: CanvasFood): string {
  return createHash("sha256")
    .update(
      [
        food.name,
        String(food.amount),
        food.unit,
        String(food.calories),
        String(food.protein),
        String(food.carbs),
        String(food.fat),
      ].join("|"),
    )
    .digest("hex");
}

/** Canvas `createInitialMealPlan` output for the demo client: variant
 * "TD" with Breakfast/Lunch/Afternoon/Dinner carrying the catalog's
 * preferred foods at the canvas default portions (Oats 50 g, Chicken
 * Breast (Cooked) 150 g, Arla 0% Fat Vanilla Skyr 200 g, Salmon
 * (Cooked) 150 g). The demo adds no targets or swaps. */
const DEMO_DRAFT = {
  name: "Nutrition plan",
  startDate: DEMO_START_DATE,
  activeVariantId: "v_td_demo",
  schedule: { mode: "manual", selectedVariantId: "v_td_demo" },
  variants: [
    {
      id: "v_td_demo",
      label: "TD",
      meals: [
        {
          id: "m_demo_breakfast",
          label: "Breakfast",
          time: "08:00",
          frequency: "Daily",
          portions: [{ foodId: "food-057", quantity: 50 }],
        },
        {
          id: "m_demo_lunch",
          label: "Lunch",
          time: "12:30",
          frequency: "Daily",
          portions: [{ foodId: "food-001", quantity: 150 }],
        },
        {
          id: "m_demo_afternoon",
          label: "Afternoon",
          time: "16:00",
          frequency: "Daily",
          portions: [{ foodId: "food-451", quantity: 200 }],
        },
        {
          id: "m_demo_dinner",
          label: "Dinner",
          time: "19:30",
          frequency: "Daily",
          portions: [{ foodId: "food-005", quantity: 150 }],
        },
      ],
    },
  ],
};

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`set ${name} (seed credentials are env-only)`);
  return value;
}

export default async function seed(ctx: SeedContext): Promise<void> {
  const { prisma } = ctx;

  // 1. Canvas food catalog -> nutrition_catalog_item (canvas ids kept).
  let foods = 0;
  for (const [i, food] of canvasFoods().entries()) {
    const row = {
      name: food.name,
      amount: food.amount,
      unit: food.unit,
      calories: food.calories,
      protein: food.protein,
      carbs: food.carbs,
      fats: food.fat,
      rowFingerprint: fingerprint(food),
      sourceNo: 900_000 + i,
      state: null,
      category: null,
    };
    await prisma.nutritionCatalogItem.upsert({
      where: { id: food.id },
      update: row,
      create: { id: food.id, ...row },
    });
    foods += 1;
  }

  // 2. Roster assignments: coach PRIMARY on all clients, owner COACH.
  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { slug: WORKSPACE_SLUG },
    select: { id: true },
  });
  const coachUser = await prisma.user.findUniqueOrThrow({
    where: { email: requiredEnv(COACH_EMAIL_ENV) },
    select: { id: true },
  });
  const ownerUser = await prisma.user.findUniqueOrThrow({
    where: { email: requiredEnv(OWNER_EMAIL_ENV) },
    select: { id: true },
  });
  const coachMember = await prisma.workspaceMember.findFirstOrThrow({
    where: { workspaceId: workspace.id, userId: coachUser.id },
    select: { id: true },
  });
  const ownerMember = await prisma.workspaceMember.findFirstOrThrow({
    where: { workspaceId: workspace.id, userId: ownerUser.id },
    select: { id: true },
  });

  const profiles = await prisma.clientProfile.findMany({
    where: { workspaceId: workspace.id },
    select: { id: true, name: true },
  });
  let assignments = 0;
  for (const profile of profiles) {
    await prisma.clientAssignment.upsert({
      where: {
        clientProfileId_coachMemberId: {
          clientProfileId: profile.id,
          coachMemberId: coachMember.id,
        },
      },
      update: { role: "PRIMARY", status: "ACTIVE" },
      create: {
        workspaceId: workspace.id,
        clientProfileId: profile.id,
        coachMemberId: coachMember.id,
        role: "PRIMARY",
        status: "ACTIVE",
      },
    });
    await prisma.clientAssignment.upsert({
      where: {
        clientProfileId_coachMemberId: {
          clientProfileId: profile.id,
          coachMemberId: ownerMember.id,
        },
      },
      update: { role: "COACH", status: "ACTIVE" },
      create: {
        workspaceId: workspace.id,
        clientProfileId: profile.id,
        coachMemberId: ownerMember.id,
        role: "COACH",
        status: "ACTIVE",
      },
    });
    assignments += 2;
  }

  // 3. Demo meal plan for the first canvas client.
  const emma = profiles.find((p) => p.name === DEMO_CLIENT_NAME);
  if (!emma)
    throw new Error(
      `demo client "${DEMO_CLIENT_NAME}" not seeded — run 00-workspace first`,
    );
  const activation = resolveLocalInstant(PLAN_TIMEZONE, DEMO_EFFECTIVE_DATE, 0);
  if (activation.status !== "ok")
    throw new Error(`demo plan activation unresolvable: ${activation.status}`);

  const plan = await prisma.mealPlan.upsert({
    where: { clientProfileId: emma.id },
    update: {
      title: "Nutrition plan",
      timezone: PLAN_TIMEZONE,
      draft: DEMO_DRAFT,
    },
    create: {
      workspaceId: workspace.id,
      clientProfileId: emma.id,
      title: "Nutrition plan",
      timezone: PLAN_TIMEZONE,
      timezoneSetByMemberId: coachMember.id,
      timezoneSetAt: new Date(),
      draft: DEMO_DRAFT,
      draftRevision: 1,
      draftSavedByMemberId: coachMember.id,
      draftUpdatedAt: new Date(),
      createdByMemberId: coachMember.id,
    },
  });
  await prisma.mealPlanVersion.upsert({
    where: {
      mealPlanId_versionSeq: { mealPlanId: plan.id, versionSeq: 1 },
    },
    update: { payload: DEMO_DRAFT },
    create: {
      workspaceId: workspace.id,
      mealPlanId: plan.id,
      clientProfileId: emma.id,
      versionSeq: 1,
      effectiveDate: new Date(`${DEMO_EFFECTIVE_DATE}T00:00:00Z`),
      effectiveTimezone: PLAN_TIMEZONE,
      activationInstant: activation.instant,
      payload: DEMO_DRAFT,
      publishOriginRevision: 1,
      publishedByMemberId: coachMember.id,
    },
  });

  console.log(
    `[seed] nutrition: ${foods} foods, ${assignments} assignments, ` +
      `meal plan + version 1 for ${DEMO_CLIENT_NAME}`,
  );
}
