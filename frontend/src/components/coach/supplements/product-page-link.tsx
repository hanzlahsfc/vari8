import { ExternalLink } from "lucide-react";
import { type SupplementProduct, safeProductUrl } from "./model";

export function ProductPageLink({
  product,
}: {
  product: Pick<SupplementProduct, "brand" | "name" | "url">;
}) {
  const href = safeProductUrl(product.url);
  if (!href) return null;
  const label = `Open ${product.brand} ${product.name} product page (opens in a new tab)`;
  return (
    <a
      className="v8-icon-button"
      data-size="sm"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={label}
      aria-label={label}
    >
      <ExternalLink size={15} aria-hidden="true" />
    </a>
  );
}
