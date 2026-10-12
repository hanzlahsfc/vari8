# FRONTEND-INTEGRATION-I3 — Light/dark appearance control

## Scope (owner-approved, Prompt 85)

Bounded browser-local appearance switching between the two existing
themes (`pro-dark` default, `pro-white`). Personal preference only —
no account/workspace persistence, no cross-device sync, no custom
accents, font changes, or new palettes. Accents/fonts/settings remain
roadmap items.

## Design

- `components/theme-toggle.tsx` — client component, two whitelisted
  buttons (`Dark`/`Light`, `aria-pressed`), `useSyncExternalStore`
  against a module singleton so every mounted toggle stays coherent.
- `app/layout.tsx` — `suppressHydrationWarning` + an inline head
  bootstrap that reads `localStorage["appearance"]` and applies
  `data-theme` only when the value is `pro-dark` or `pro-white`;
  malformed/foreign/injected content can never reach the DOM.
  `pro-dark` remains the SSR default.
- `<ThemeToggle />` rendered next to `<SignOutButton />` in the five
  shells that already replicate the workspace aside: the staff
  `workspace/[ws]` layout and the four client `(tracker)` layouts
  (home, daily, check-ins, onboarding).
- `.theme-toggle` styles in `app/globals.css` — tokens only; selected
  state via accent border; focus-visible ring; 44px targets.
- Persistence: `localStorage["appearance"]` ∈ {`pro-dark`, `pro-white`},
  written on toggle click only. Storage failure → session-scoped
  switching (try/catch). No identity/client/consent data is stored.

## Boundaries

No database/API/RBAC/audit changes; no new dependencies; admission and
destination gates untouched; appearance is personal cosmetic preference,
not workspaceSettings.

## Status

Implementation candidate on `feature/frontend-i3-appearance`.
Self-review NON-INDEPENDENT. No PR, merge, deployment, or production
enablement.
