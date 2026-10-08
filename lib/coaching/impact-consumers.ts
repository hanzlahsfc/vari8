import type { PrismaLike } from "../workspace/access";
import { ClientSetupTransitionError } from "./client-setup-transition-gate";
import {
  createDailyEntryImpactProvider,
  DAILY_ENTRY_CONSUMER,
} from "./daily-entry-impact";
import {
  validateProviderSet,
  type ConsumerDeclaration,
  type ProviderSet,
  type TransitionImpactProvider,
} from "./transition-impact";

/**
 * P-020B/P-021 — the production C2 consumer registry (framework layer #59).
 * Static imports only — no dynamic registration. Declarations and provider
 * factories must cover exactly the same consumer-key set; validation runs at
 * module load and again at composition time, so a mismatch fails closed.
 *
 * Providers are composed PER REQUEST with the server-resolved client
 * identity (the provider interface accepts no client/workspace identifiers).
 */

export const DECLARED_CONSUMERS: readonly ConsumerDeclaration[] = [
  DAILY_ENTRY_CONSUMER,
];

export type TransitionImpactProviderFactory = (ctx: {
  db: PrismaLike;
  clientProfileId: string;
}) => TransitionImpactProvider;

export const PROVIDER_FACTORIES: Readonly<
  Record<string, TransitionImpactProviderFactory>
> = {
  "daily-entry": ({ db, clientProfileId }) =>
    createDailyEntryImpactProvider(db, clientProfileId),
};

/** Declaration↔factory exact-set equality — same fail-closed shape as
 * `validateProviderSet` (declaration-without-factory and
 * factory-without-declaration both throw). */
export function validateProviderFactories(
  declarations: readonly ConsumerDeclaration[],
  factories: Readonly<Record<string, TransitionImpactProviderFactory>>,
): void {
  const declared = new Set(declarations.map((d) => d.consumerKey));
  const provided = new Set(Object.keys(factories));
  if (declared.size !== provided.size)
    throw new ClientSetupTransitionError("provider_configuration");
  for (const key of provided)
    if (!declared.has(key))
      throw new ClientSetupTransitionError("provider_configuration");
  for (const key of declared)
    if (!provided.has(key))
      throw new ClientSetupTransitionError("provider_configuration");
}

/** Per-request provider-set composition — factories bind the
 * server-resolved client identity; the transition service may still inject
 * an explicit ProviderSet in tests. */
export function composeProviderSet(
  db: PrismaLike,
  clientProfileId: string,
): ProviderSet {
  validateProviderFactories(DECLARED_CONSUMERS, PROVIDER_FACTORIES);
  const providers: Record<string, TransitionImpactProvider> = {};
  for (const declaration of DECLARED_CONSUMERS) {
    const factory = PROVIDER_FACTORIES[declaration.consumerKey];
    if (!factory)
      throw new ClientSetupTransitionError("provider_configuration");
    providers[declaration.consumerKey] = factory({ db, clientProfileId });
  }
  validateProviderSet(DECLARED_CONSUMERS, providers);
  return { declarations: DECLARED_CONSUMERS, providers };
}

// Module-load fail-closed assertion — the registry must be internally
// consistent before any request can compose it.
validateProviderFactories(DECLARED_CONSUMERS, PROVIDER_FACTORIES);
