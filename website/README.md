# Vari8 product page (local prototype)

Standalone static product page for Vari8 — a preview for sharing and
showcasing the product. **Local preview only.** Not connected to the app, its
backend, or any signup service.

## Preview

```sh
cd website
python3 -m http.server 8420
# open http://127.0.0.1:8420/
```

(any static server works; there is no build step)

## Contents

- `index.html` — single product page
- `styles.css` — scoped styles; visual tokens mirror the canvas preview
- `assets/fonts/` — `InfinityGeist.woff2` + `StudioGaramond-Regular.ttf`,
  copied from `frontend/public/fonts/` (in-repo canvas assets)
- `assets/grain.png` — copied from `frontend/public/grain.png`
- `assets/shots/` — three canvas captures from `icm/04-briefing/shots/`
  (synthetic demo data only): `s01-roster`, `s03-checkins-board`,
  `s09-tracker-today`

## Known limitations

- **Early access is not connected.** The form controls are disabled and
  nothing is sent or stored — destination and privacy wording are undecided.
- Demo screenshots are approved for this private local prototype; reusing them
  on a public site needs owner confirmation first.
- Font licensing for redistribution is unverified; acceptable for local
  preview, must be checked before any public deployment.
- No analytics, cookies, backend calls or external requests.
- Product updates section intentionally omitted — no approved public
  changelog content exists yet.
