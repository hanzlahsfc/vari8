import { ExerciseResults } from "@/components/exercise/exercise-results";
import {
  requireSessionUser,
  requireWorkspaceAccess,
} from "@/lib/auth/route-guard";
import { prisma } from "@/lib/db";
import {
  listExerciseEquipment,
  listExerciseMuscleGroups,
  searchExerciseCatalog,
} from "@/lib/exercise/search";

export const dynamic = "force-dynamic";

export const metadata = { title: "Exercise Database" };

/**
 * Phase 2.2 staff Exercise Database catalog.
 *
 * Session gate first (unauthenticated → `/login`), then the reviewed
 * `foodExerciseMasterData/read` workspace authorization (denied → HTTP 403).
 * Search is a plain GET form (works without JavaScript) so results are
 * server-rendered, bounded, and index-backed. Only source-imported fields are
 * shown; nothing is prescribed or calculated.
 */
export default async function ExerciseCatalogPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{
    q?: string | string[];
    muscleGroup?: string | string[];
    equipment?: string | string[];
  }>;
}) {
  const { workspaceId } = await params;
  const query = await searchParams;
  const q = typeof query.q === "string" ? query.q : "";
  const muscleGroup =
    typeof query.muscleGroup === "string" ? query.muscleGroup : "";
  const equipment = typeof query.equipment === "string" ? query.equipment : "";

  const { session } = await requireSessionUser();
  await requireWorkspaceAccess(session, {
    resource: "foodExerciseMasterData",
    action: "read",
    workspaceId,
  });

  const [muscleGroups, equipmentOptions, result] = await Promise.all([
    listExerciseMuscleGroups(prisma),
    listExerciseEquipment(prisma),
    searchExerciseCatalog(prisma, { query: q, muscleGroup, equipment }),
  ]);

  return (
    <div className="catalog-page" data-testid="exercise-catalog">
      <header className="catalog-page__header">
        <p className="catalog-page__eyebrow">Workspace catalog</p>
        <h1 className="app-title">Exercise Database</h1>
        <p className="app-lede">
          Search the imported PRGRSS Exercise Database. Values are shown exactly
          as recorded in the source; no prescriptions, progressions, or training
          recommendations are calculated here.
        </p>
      </header>

      <form
        className="catalog-search"
        method="get"
        role="search"
        aria-label="Exercise Database search"
      >
        <div className="catalog-search__field">
          <label htmlFor="catalog-query">EXERCISE NAME</label>
          <input
            id="catalog-query"
            className="catalog-search__input"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="e.g. squat"
            autoComplete="off"
          />
        </div>
        <div className="catalog-search__field">
          <label htmlFor="catalog-muscle-group">MUSCLE GROUP</label>
          <select
            id="catalog-muscle-group"
            className="catalog-search__input"
            name="muscleGroup"
            defaultValue={muscleGroup}
          >
            <option value="">All</option>
            {muscleGroups.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <div className="catalog-search__field">
          <label htmlFor="catalog-equipment">EQUIPMENT</label>
          <select
            id="catalog-equipment"
            className="catalog-search__input"
            name="equipment"
            defaultValue={equipment}
          >
            <option value="">All</option>
            {equipmentOptions.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="catalog-search__submit">
          Search
        </button>
      </form>

      <ExerciseResults result={result} />
    </div>
  );
}
