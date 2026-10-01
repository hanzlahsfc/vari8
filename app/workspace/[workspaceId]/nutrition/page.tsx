import { NutritionResults } from "@/components/nutrition/nutrition-results";
import {
  requireSessionUser,
  requireWorkspaceAccess,
} from "@/lib/auth/route-guard";
import { prisma } from "@/lib/db";
import {
  listNutritionCategories,
  searchNutritionCatalog,
} from "@/lib/nutrition/search";

export const dynamic = "force-dynamic";

export const metadata = { title: "Nutrition Database" };

/**
 * Phase 2.1 staff Nutrition Database catalog.
 *
 * Session gate first (unauthenticated → `/login`), then the reviewed
 * `foodExerciseMasterData/read` workspace authorization (denied → HTTP 403).
 * Search is a plain GET form (works without JavaScript) so results are
 * server-rendered, bounded, and index-backed. Only source-imported fields are
 * shown; nothing is calculated.
 */
export default async function NutritionCatalogPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ q?: string | string[]; cat?: string | string[] }>;
}) {
  const { workspaceId } = await params;
  const query = await searchParams;
  const q = typeof query.q === "string" ? query.q : "";
  const cat = typeof query.cat === "string" ? query.cat : "";

  const { session } = await requireSessionUser();
  await requireWorkspaceAccess(session, {
    resource: "foodExerciseMasterData",
    action: "read",
    workspaceId,
  });

  const [categories, result] = await Promise.all([
    listNutritionCategories(prisma),
    searchNutritionCatalog(prisma, { query: q, category: cat }),
  ]);

  return (
    <div className="catalog-page" data-testid="nutrition-catalog">
      <header className="catalog-page__header">
        <p className="catalog-page__eyebrow">Workspace catalog</p>
        <h1 className="app-title">Nutrition Database</h1>
        <p className="app-lede">
          Search the imported PRGRSS Nutrition Database. Values are shown
          exactly as recorded in the source; no targets, totals, or nutrition
          interpretations are calculated here.
        </p>
      </header>

      <form
        className="catalog-search"
        method="get"
        role="search"
        aria-label="Nutrition Database search"
      >
        <div className="catalog-search__field">
          <label htmlFor="catalog-query">FOOD</label>
          <input
            id="catalog-query"
            className="catalog-search__input"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="e.g. chicken"
            autoComplete="off"
          />
        </div>
        <div className="catalog-search__field">
          <label htmlFor="catalog-category">CAT</label>
          <select
            id="catalog-category"
            className="catalog-search__input"
            name="cat"
            defaultValue={cat}
          >
            <option value="">All</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="catalog-search__submit">
          Search
        </button>
      </form>

      <NutritionResults result={result} />
    </div>
  );
}
