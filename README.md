# RevMatch

A garage for car people: a build page for every car (drafted from four photos), drive recording on your phone with optional OBD-II, and a small social network with friends, likes, invites and car-meet QR codes.

- **Going live:** [DEPLOY.md](DEPLOY.md), step by step
- **Running it:** [docs/OPERATIONS.md](docs/OPERATIONS.md) covers errors, background jobs, backups and tests
- **Phone app:** [mobile/README.md](mobile/README.md)

Built with **Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · React Three Fiber · Supabase · Recharts · Leaflet**.

---

## Quick start

```bash
npm install
cp .env.example .env.local     # fill in Supabase URL + anon key at minimum
npm run dev
```

1. Create a Supabase project.
2. Apply the schema: `supabase link` then `supabase db push`, or paste each file in `supabase/migrations/` (0001 to 0007, in order) into the SQL editor. They create the tables, row-level security, helper functions, triggers and storage buckets.
3. In **Authentication → URL configuration**, add `http://localhost:3000/auth/callback` (and your production URL) to the redirect allow-list.
4. Visit `/setup` to see which integrations are configured.

```bash
npm test          # analysis engine, OBD parser, and every access rule on an in-process Postgres
npm run build
npm run e2e       # browser tests against the build (full flow needs E2E_FULL=1 and a real Supabase)
```

---

## What needs external services, permissions or hardware

| Feature | Requirement | Without it |
|---|---|---|
| Accounts, data, photo storage | **Supabase** (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) | App redirects to `/setup` |
| AI vehicle identification | **Anthropic API** (`ANTHROPIC_API_KEY`), Claude vision with structured output | Wizard shows a notice; enter details manually |
| "Find my car" 3D model + model library | `ANTHROPIC_API_KEY` + `SUPABASE_SERVICE_ROLE_KEY` + `SKETCHFAB_API_TOKEN` and/or `MESHY_API_KEY`, plus `CRON_SECRET` for the scheduled jobs | Car page leads with the owner's photos and the built-in studio model |
| Error tracking, job queue, AI cost limits | `SUPABASE_SERVICE_ROLE_KEY` (optional `ERROR_WEBHOOK_URL` for Slack/Discord pings) | Errors go to the server log only; AI limits aren't enforced |
| Background drive recording, OBD-II on iPhone | The phone app in `mobile/` | Web recording works while the screen is on |
| Maps | CARTO dark basemap tiles + OpenStreetMap data (no key; attribution shown) | — |
| Drive recording | Browser **Geolocation** permission, HTTPS | Drive screen shows the error |
| Peak-g estimate | **DeviceMotion** permission (prompted on iOS) | Omitted; GPS/OBD values used |
| Screen stays on while recording | **Screen Wake Lock API** (most modern mobile browsers) | Recording pauses if the screen locks |
| OBD-II | **BLE ELM327-compatible adapter** + **Web Bluetooth** (Chrome/Edge on Android, Windows, macOS, ChromeOS) | GPS-only. Not supported: iOS browsers, Bluetooth Classic (SPP) and Wi-Fi adapters |


---

## Architecture

```
src/
  app/
    page.tsx                  Landing (3D hero cycles paints; UI accent follows)
    (auth)/                   Login / signup (email+password, magic link)
    (app)/                    Signed-in area (middleware + requireViewer guard)
      dashboard/              Primary car hero, lifetime stats, recent drives, network feed
      garage/                 Garage list, add-vehicle wizard, edit
      drive/                  Live telemetry console (GPS, auto-detect, OBD-II)
      drives/                 History, drive report, compare
      feed/ friends/ settings/
    (public)/                 Works signed-out too
      v/[slug]/               Vehicle build sheet: QR target, 3D, mods, photos, stats, timeline
      u/[username]/           Profile
    api/
      ai/identify             Claude vision → structured identification
      models/{search,import,generate,status}   Sketchfab + Meshy pipeline
  components/
    three/                    VehicleViewer (R3F), ProceduralCar, geometry, part map
    vehicle/ garage/ drive/ social/ ui/ shell/
  lib/
    drive/analysis.ts         Pure telemetry analysis (unit-tested)
    drive/recorder.ts         Geolocation/DeviceMotion recorder + trip detector
    obd/elm327.ts             ELM327 over Web Bluetooth, PID decoding
    color.ts                  Paint → accent derivation
    supabase/                 Browser/server/middleware clients
supabase/migrations/0001_init.sql
tests/
```

### Data model

`profiles`, `user_settings`, `follows` (with `pending` for private profiles), `friendships` (one row per unordered pair), `vehicles` (unguessable `slug` for QR), `modifications`, `vehicle_photos`, `build_events`, `drives` (share-safe aggregates), `drive_samples` (raw GPS/OBD; **owner-only**), `posts`, `post_likes`, `post_comments`.

### Security model (enforced in Postgres RLS, not the UI)

- Helper functions `are_friends`, `is_following`, `can_view_profile`, `can_view_vehicle`, `can_view_post` and `can_view_drive` back every policy.
- **Vehicles**: `public` (anyone, including signed-out QR scans), `friends`, or `private`. Mods, photos and events inherit their vehicle's visibility.
- **Private profiles** hide the garage and activity until a follow request is approved or you become friends.
- **Drives**: `drive_samples` (coordinates, timestamps) can only be read by the owner. Shared drives expose aggregates, a speed series without location, and optionally a route with the first and last *N* metres removed (`endpoint_privacy_m`). Start and finish coordinates are never stored in a shareable column.
- **Public vehicle stats** come from `vehicle_public_stats()`, which returns totals only, and only if the owner enables it.
- Storage writes are limited to `<uid>/…` folders. Files are served from public buckets under random UUID paths; listing is owner-only. *If you need private photos to be unreachable even by direct URL, switch the `vehicle-photos` bucket to private and serve signed URLs.*
- `owner_id` is immutable, and friendship parties can't be rewritten.

`tests/rls.test.ts` runs the real migration on PGlite with stubbed `auth`/`storage` schemas and checks these rules as different users.

---

## Key systems

### Adaptive accent colour
`accentFromPaint()` keeps the paint's hue and lifts it into a lightness band that reads on near-black. Achromatic paints (black, white, silver, grey) get a cool titanium accent instead of an invisible grey. `AccentScope` sets the CSS variables, so a vehicle page takes that car's colour even inside a profile with a different accent. Users can switch to a custom accent in Settings.

### 3D vehicles (hybrid)
1. **Realistic studio model** (default): a photoreal, high-detail sports car (`public/models/studio-car.glb`) recoloured live with the vehicle's paint and finish (gloss, metallic, satin or matte clearcoat), rim colour, calipers, glass tint and ride height. Carbon aero parts (lip, ducktail, wing, GT wing, splitter, diffuser, skirts) and exhaust tips are placed on the real bodywork by raycasting. Every part is clickable. It is labelled a **stand-in**, because it shows your spec on a generic body, not your car's exact shape.
2. **Parametric model**: generated from the body style (coupe, sedan, hatch, wagon, SUV, truck). Less realistic, but its proportions follow your car type, and it supports wheel designs and stripes.
3. **Library model**: Sketchfab search (downloadable car models), GLB import into your storage, licence attribution shown. This is how you get your *exact* car.
4. **AI generation**: Meshy multi-image-to-3D from your front ¾, side and rear ¾ photos; progress is polled; the result is labelled *"AI-generated approximation, not a scan"*.

Imported and generated models need **owner approval** and show *pending review* until then. For GLB models, mods appear as clickable hotspots projected from anchor points. Non-visual mods (tune, intake, turbo, interior) always appear as hotspots.

**Rendering:** a photographic studio HDRI (Poly Haven, CC0, bundled via `@pmndrs/assets`, so there are no runtime downloads) plus softbox light-formers, AgX tone mapping, soft contact shadows, bloom, vignette and SMAA. Desktops also get a blurred mirror floor; phones and low-core devices get a lighter pipeline automatically (`quality="auto"`).

**Studio model licence:** "Car Concept" from the Khronos glTF Sample Assets, **CC BY 4.0**, itself derived from a public-domain model by Unity Fan. Khronos logos, which the licence excludes, have been removed. The credit is shown in the viewer, and details are in `public/models/ATTRIBUTION.md`.

### AI model agent (fallback for cars without a library model)
`src/lib/agent/modelAgent.ts` is a Claude agent (Opus 5.5, tool runner) with these tools:
`search_sketchfab` → `view_candidate` (thumbnail + metadata, compared with the owner's photos) → `download_model` (stores the GLB and returns its materials and mesh nodes with world-space bounds, via `glbInspect.ts`) → `map_base_model` (paint, glass and caliper materials, the four wheel nodes, nodes to hide, front axis) → `add_part` per visible mod (a Sketchfab part model with anchor, orientation, size and the base nodes it replaces) → `set_material` → `finish`.

- **Licences:** only CC BY and CC0 (commercial use and modification allowed), enforced in code, not left to the model. Every model used is credited in `vehicles.model_attribution`.
- **Quality rules** in the prompt: the right generation and body, no toys or game rips, prefers original creators, realistic PBR and modelled interiors.
- **Output:** an `AssemblyPlan` (`src/lib/agent/plan.ts`, zod-validated) saved to `vehicles.model_assembly`. `AssembledCar.tsx` rebuilds it: it orients and scales the base, recolours mapped materials (the owner's paint and tint choices win), hides replaced nodes, and fits parts at anchors found by raycasting the real bodywork (rear deck, front lip, rear lower, side skirts, roof, each wheel).
- **Runs** via `POST /api/models/agent` in the background (`after()`), logging progress to `vehicles.model_agent_log`, which the vehicle page polls. Apply `0002_model_agent.sql` and `0003_model_library.sql`. Runs take a few minutes, so host on a plan that allows long function durations, or move the call to a worker.
- **Limits:** parts are fitted by bounding box and anchor, so complex body kits can sit imperfectly; the owner approves the result before visitors see it as final. Car models may include manufacturer badges, so check trademark use before public commercial launch.

### Model library agent (stock models on standby)
Every car generation only needs its stock model built once, so RevMatch prepares them ahead of time and shares them between owners.

- **Catalogue:** `src/lib/agent/catalog.ts` lists ~90 popular cars by generation and year range (e.g. VW Eos 1F, 2007–2016; Ford F-150 14th gen; Porsche 911 992). `bestMatch` maps an owner's year, make and model onto an entry (make aliases like VW and Chevy, punctuation and accents ignored, closest model name wins, so a 911 GT3 RS doesn't get the plain 911 and an M340i isn't an M3).
- **Library agent:** `src/lib/agent/libraryAgent.ts` is a Claude agent (Opus 5.5, tool runner) that builds one entry. It searches Sketchfab for a licensed (CC BY / CC0), realistic model of that exact generation. If none is good enough and `MESHY_API_KEY` is set, it **designs the car itself** with Meshy Text to 3D (`meshyText.ts`): it writes a precise description of the stock car, checks the generated model's thumbnail, and retries once if the shape is wrong. It then maps paint, glass, calipers and wheels (`map_base_model`) and records the generation's real year range, factory colours (signature first) and signature details. Generated models are labelled "AI-generated, not a scan".
- **Storage:** `model_library` table (`0003_model_library.sql`). Signed-in users can read ready entries; only the service role writes. Statuses: queued → building → ready / none_found / failed (failed entries retry up to 3 times).
- **Scheduled job:** `GET /api/models/library/prewarm` (Vercel Cron every 30 minutes, see `vercel.json`, protected by `CRON_SECRET`) queues the catalogue and builds the most-requested queued entries, `LIBRARY_BATCH` (default 2) per run.
- **On demand:** when an owner presses "Build my car", `/api/models/agent` checks the library first. A ready entry is applied instantly in the owner's paint. If the owner has visible mods (wheels, wing, splitter, diffuser, body kit, exhaust), the per-car agent then starts from that library base and only fits the mods. A car that isn't in the library yet gets the normal per-car agent and is queued (or its demand raised), so the next owner of that car gets it instantly.
- `GET /api/models/library` lists what's on standby.
- Needs `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `SKETCHFAB_API_TOKEN` and/or `MESHY_API_KEY`. Each entry is a multi-minute run (Meshy generation adds several minutes and Meshy credits), so host on a plan with long function durations.

### AI identification
`/api/ai/identify` sends up to 6 downscaled photos to Claude (`claude-opus-5-5`, adaptive thinking, zod-validated structured output). It returns a year *range*, make/model/trim/generation, body style, paint hex and finish, visual parameters for the 3D model, and suspected mods with evidence and confidence. Low-confidence mods start unchecked. Every AI-filled field is flagged "AI · verify" in the form.

### Drive analytics: how numbers are made, and when they're withheld
- **Speed source priority**: OBD-II, then GPS Doppler (`coords.speed`), then position-derived. Each point keeps its source, and the report and tooltips label it.
- **Distance**: sum of segments between fixes within the accuracy limit. Stationary jitter (moves smaller than the reported accuracy) and impossible jumps (over 110 m/s) are dropped.
- **Max speed** must hold across two consecutive median-filtered points, so a single GPS spike can't become a record.
- **Elevation** uses a 3 m hysteresis filter on GPS altitude, labelled as such.
- **Acceleration runs** (0–60 mph, 0–100 km/h, 30–70 mph, 100–200 km/h) are only reported from **direct speed** (OBD or Doppler, never position-derived), with every gap ≤ 1.5 s and no lift. Runs are tagged `good` (≥ ~5 Hz) or `estimate` (≈1 Hz GPS), with sample rate shown.
- **Peak g** comes from direct-speed deltas over ≥ 1 s windows, or falls back to the phone accelerometer's 99th percentile, labelled as approximate.
- **Road segments** (city/arterial/highway/stopped) are inferred from sustained speed bands and say so. They contain no locations.
- **Confidence** is high/medium/low based on mean accuracy, sample rate and direct-speed share.
- Interrupted recordings stay as `recording` and can be **finalized** from stored samples. Any drive can be **recomputed** after changing settings.

### Automatic trip detection
While the Drive screen is open, a low-cost location watch looks for sustained speed above a threshold, then asks or auto-starts according to your settings. Auto-started drives stop after a configurable idle time. **Limitation:** browsers suspend geolocation in the background, so the web recorder warns about gaps when the screen was off. The phone app in `mobile/` records in the background and sends its samples through the same analysis (`POST /api/drives/:id/finalize`).

### OBD-II
`Elm327` connects over BLE GATT, initialises the adapter (`ATZ`, `ATE0`, `ATSP0`…), reads the supported-PID bitmaps (`0100`/`0120`), and polls **only supported PIDs**: RPM, speed, throttle, load, coolant, IAT, MAP, MAF, timing and fuel level. Unsupported PIDs appear as "n/a, unsupported", never as zero. OBD speed replaces GPS speed for timing while connected. The phone app (`mobile/src/lib/obd.ts`) uses the same commands over react-native-ble-plx, so it also works on iPhone.

### QR codes
Each vehicle has a random 18-hex-character `slug`. The QR encodes only `/v/<slug>`, rendered client-side (PNG 1024 px and SVG download, or the Web Share API). The page shows only what RLS lets an anonymous visitor read. A private vehicle shows "unavailable" without confirming it exists.

---

## Extending
- New mod categories: add to `MOD_CATEGORIES` (`src/lib/types.ts`), map visual ones in `CATEGORY_PART` / `PIN_ANCHOR`.
- New visual part: add geometry in `ProceduralCar.tsx`, a field in `ModelConfig`, and a control in `ModelConfigurator.tsx`.
- New OBD channel: add a `PidDef` in `src/lib/obd/elm327.ts` and a column in `drive_samples`.
- Map matching or real road classification: post-process `drive_samples` server-side (Mapbox Map Matching, OSRM) and write results to `drives.segments` with a new `basis` value.
