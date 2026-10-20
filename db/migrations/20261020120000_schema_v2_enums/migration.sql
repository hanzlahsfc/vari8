-- PR-M0 schema v2 (1 of 2): enum value additions only. Values added in
-- PostgreSQL cannot be used inside the same transaction that adds them,
-- so every ALTER TYPE ADD VALUE lives alone here; the follow-up
-- 20261020120100_schema_v2 migration consumes them.

ALTER TYPE "public"."ParameterKind" ADD VALUE 'BLOOD_PRESSURE';
ALTER TYPE "public"."ParameterKind" ADD VALUE 'LOCATION_RATING';
ALTER TYPE "public"."ParameterKind" ADD VALUE 'CONTEXT';
ALTER TYPE "public"."ParameterKind" ADD VALUE 'MULTI_CHOICE';

ALTER TYPE "public"."CheckInAnswerKind" ADD VALUE 'RATING';
ALTER TYPE "public"."CheckInAnswerKind" ADD VALUE 'VISUAL';
