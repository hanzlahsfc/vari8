import { groupByTiming } from "./group-by-timing";
import {
  dosageForQuantity,
  type SupplementItem,
  type SupplementPlan,
  supplementStatusLabel,
} from "./model";
import { ProductPageLink } from "./product-page-link";

const formatAmount = (amount: number) =>
  Number(amount.toFixed(2)).toLocaleString("en-US");

function SupplementViewItem({ item }: { item: SupplementItem }) {
  const dosage = dosageForQuantity(item.product, item.quantity);
  return (
    <li className="supp-item">
      <div className="supp-item-main">
        <span className="supp-item-title">
          <strong>
            {item.product.brand} · {item.product.name}
          </strong>
          <ProductPageLink product={item.product} />
        </span>
        <small>
          Quantity: {item.quantity}
          {item.product.quantityUnit ? ` ${item.product.quantityUnit}` : ""}
        </small>
        <small>
          Dosage:{" "}
          {dosage
            ? `${formatAmount(dosage.amount)} ${dosage.unit}`
            : "Not provided"}
        </small>
      </div>
      <div className="supp-item-meta">
        <span>{item.timing || "No timing set"}</span>
        <span>{supplementStatusLabel(item.status)}</span>
        {item.notes ? <small>{item.notes}</small> : null}
      </div>
    </li>
  );
}

// Read-only saved plan — shared by the coach preview and the client view.
export function SupplementPlanView({
  plan,
  clientName,
}: {
  plan?: SupplementPlan;
  clientName?: string;
}) {
  if (!plan)
    return (
      <section className="supp-view" aria-label="Supplement plan">
        <p className="supp-empty">
          No supplement plan saved{clientName ? ` for ${clientName}` : ""} yet.
        </p>
      </section>
    );
  if (!plan.items.length)
    return (
      <section className="supp-view" aria-label="Supplement plan">
        <p className="supp-empty">
          {plan.name} · saved {new Date(plan.savedAt).toLocaleDateString()} · no
          products prescribed.
        </p>
      </section>
    );
  const groups = groupByTiming(plan.items);
  return (
    <section className="supp-view" aria-label="Supplement plan">
      <div className="supp-view-head">
        <strong>{plan.name}</strong>
        <small>Saved {new Date(plan.savedAt).toLocaleDateString()}</small>
      </div>
      {groups.map((group) => (
        <section className="supp-view-group" key={group.key || "no-timing"}>
          <h3>
            {group.label}
            <span>{group.items.length}</span>
          </h3>
          <ul className="supp-list">
            {group.items.map((item) => (
              <SupplementViewItem item={item} key={item.id} />
            ))}
          </ul>
        </section>
      ))}
    </section>
  );
}
