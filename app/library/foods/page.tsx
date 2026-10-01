import { AppNav } from "@/components/app-nav";
import { foodCategories } from "@/lib/catalog";
import { getFoods } from "@/lib/spec-artifacts";

import { FoodLibrary } from "./food-library";

export const metadata = { title: "Foods — App" };

export default function FoodsLibraryPage() {
  const foods = getFoods();
  return (
    <main className="app-main">
      <AppNav />
      <h1 className="app-title">Foods</h1>
      <p className="app-lede">
        Read-only synthetic reference fixture · {foods.count} placeholder rows
        (no source data), in source order. Real Nutrition data is imported into
        the database catalog, not committed as JSON.
      </p>
      <FoodLibrary
        records={foods.records}
        categories={foodCategories(foods.records)}
      />
    </main>
  );
}
