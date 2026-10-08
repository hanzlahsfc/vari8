import type { PrismaLike } from "../workspace/access";
import type {
  ConsumerDeclaration,
  ImpactReasonCode,
  ParameterImpact,
  ProviderImpact,
  TransitionImpactInput,
  TransitionImpactProvider,
} from "./transition-impact";

/**
 * P-021 — the first real C2 transition-impact consumer: DailyEntry values.
 *
 * Per (client, parameter): how many DISTINCT logical DailyEntry rows carry a
 * value for that parameter across ALL revisions (superseded revisions still
 * count — a value written then edited away remains history evidence), with
 * earliest/latest declared entry dates. One logical entry counted once no
 * matter how many revisions hold the parameter.
 *
 * Structural impact output only — never values, labels, units, options,
 * member internals, or free text. Unknown parameters produce count "0" and
 * therefore fail closed (validator rejects non-positive counts for roles
 * that require positive evidence).
 *
 * The client identity is injected server-side at construction (per request,
 * from the resolved pin/setup state) — the provider API accepts no
 * client/workspace identifiers and leaks none.
 */

export const DAILY_ENTRY_CONSUMER: ConsumerDeclaration = {
  consumerKey: "daily-entry",
  contractVersion: 1,
  outputSchemaVersion: 1,
};

type CountRow = {
  parameter_id: string;
  entry_count: string | number;
  earliest: Date | string | null;
  latest: Date | string | null;
};

const toDateString = (v: Date | string | null): string | null => {
  if (v === null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
};

export function createDailyEntryImpactProvider(
  db: PrismaLike,
  clientProfileId: string,
): TransitionImpactProvider {
  return {
    async evaluate(input: TransitionImpactInput): Promise<ProviderImpact> {
      // Role per parameterId — diff categories are disjoint per parameter.
      const roles = new Map<
        string,
        { parameterKey: string; impactRole: ParameterImpact["impactRole"] }
      >();
      for (const p of input.removed)
        roles.set(p.parameterId, {
          parameterKey: p.parameterKey,
          impactRole: "REMOVED",
        });
      for (const p of input.reboundFrom)
        if (!roles.has(p.parameterId))
          roles.set(p.parameterId, {
            parameterKey: p.parameterKey,
            impactRole: "REBOUND_FROM",
          });
      for (const p of input.reboundTo)
        if (!roles.has(p.parameterId))
          roles.set(p.parameterId, {
            parameterKey: p.parameterKey,
            impactRole: "REBOUND_TO",
          });

      const ids = [...roles.keys()];
      const counts = new Map<
        string,
        { count: string; earliest: string | null; latest: string | null }
      >();
      if (ids.length > 0) {
        const rows = await db.$queryRawUnsafe<CountRow[]>(
          `SELECT v.parameter_id,
                  COUNT(DISTINCT e.id) AS entry_count,
                  MIN(e.entry_date) AS earliest,
                  MAX(e.entry_date) AS latest
           FROM "daily_entry_revision_value" v
           JOIN "daily_entry_revision" r ON r.id = v.revision_id
           JOIN "daily_entry" e ON e.id = r.daily_entry_id
           WHERE v.parameter_id = ANY($1)
             AND r.client_profile_id = $2
           GROUP BY v.parameter_id`,
          ids,
          clientProfileId,
        );
        for (const row of rows) {
          counts.set(row.parameter_id, {
            count: String(row.entry_count),
            earliest: toDateString(row.earliest),
            latest: toDateString(row.latest),
          });
        }
      }

      // Deterministic order: parameterKey ASC, then the contract role rank
      // (duplicated from the validator — categories are disjoint, so role
      // never actually breaks a tie here). Code-unit comparison only —
      // localeCompare ordering is locale-dependent and can disagree with
      // the P-020B validator's strict ascending `parameterKey` check.
      const RANK = { REMOVED: 0, REBOUND_FROM: 1, REBOUND_TO: 2 } as const;
      const byCodeUnit = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
      const affectedParameters: ParameterImpact[] = ids
        .map((parameterId) => {
          const r = roles.get(parameterId)!;
          const c = counts.get(parameterId);
          return {
            parameterId,
            parameterKey: r.parameterKey,
            impactRole: r.impactRole,
            reasonCode: (r.impactRole === "REMOVED"
              ? "REMOVED_WITH_HISTORY"
              : "REBOUND_WITH_HISTORY") as ImpactReasonCode,
            count: c?.count ?? "0",
            earliestDate: c?.earliest ?? null,
            latestDate: c?.latest ?? null,
          };
        })
        .sort(
          (a, b) =>
            byCodeUnit(a.parameterKey, b.parameterKey) ||
            RANK[a.impactRole] - RANK[b.impactRole],
        );

      return {
        consumerKey: "daily-entry",
        contractVersion: DAILY_ENTRY_CONSUMER.contractVersion,
        affectedParameters,
        blockedReasonCodes: [],
      };
    },
  };
}
