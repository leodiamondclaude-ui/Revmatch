# RevMatch

A premium automotive platform: digital garage, interactive 3D builds, phone-GPS drive telemetry with optional OBD-II, and a social network for the car scene.

Built with **Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · React Three Fiber · Supabase · Recharts · Leaflet**.

---

## Quick start

```bash
npm install
cp .env.example .env.local     # fill in Supabase URL + anon key at minimum
npm run dev
```

1. Create a Supabase project.
2. Apply the schema: `supabase db push`, or paste `supabase/migrations/0001_init.sql` into the SQL editor. It creates tables, row-level security, helper functions, triggers and storage buckets.
3. In **Authentication → URL configuration**, add `http://localhost:3000/auth/callback` (and your production URL) to the redirect allow-list.
4. Visit `/setup` to see which integrations are configured.

```bash
npm test          # analysis engine, OBD parser, and RLS policies on an in-process Postgres
npm run build
```

---

## What needs external services, permissions or hardware

| Feature | Requirement | Without it |
|---|---|---|
| Accounts, data, photo storage | **Supabase** (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) | App redirects to `/setup` |
| AI vehicle identification | **Anthropic API** (`ANTHROPIC_API_KEY`), Claude vision with structured output | Wizard shows a notice; enter details manually |
| Existing 3D model search/import | **Sketchfab Data API** token (`SKETCHFAB_API_TOKEN`) + `SUPABASE_SERVICE_ROLE_KEY` | Option disabled; parametric model used |
| AI image-to-3D generation | **Meshy** API key (`MESHY_API_KEY`) + `SUPABASE_SERVICE_ROLE_KEY` | Option disabled; parametric model used |
| Maps | CARTO dark basemap tiles + OpenStreetMap data (no key; attribution shown) | — |
| Drive recording | Browser **Geolocation** permission, HTTPS | Drive screen shows the error |
| Peak-g estimate | **DeviceMotion** permission (prompted on iOS) | Omitted; GPS/OBD values used |
| Screen stays on while recording | **Screen Wake Lock API** (most modern mobile browsers) | Recording pauses if the screen locks |
| OBD-II | **BLE ELM327-compatible adapter** + **Web Bluetooth** (Chrome/Edge on Android, Windows, macOS, ChromeOS) | GPS-only. Not supported: iOS browsers, Bluetooth Classic (SPP) and Wi-Fi adapters |

> The Meshy request body in `src/lib/models3d.ts` uses the minimal documented fields (`image_urls`, texturing flags). Check it against the current Meshy docs before production use, because their API evolves.

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
1. **Parametric model** (always available): built in-browser from the body style plus `model_config` (paint and finish, wheel design/size/colour, calipers, ride height, tint, spoiler/wing, splitter, diffuser, skirts, exhaust layout and finish, stripes). Every part is a clickable mesh.
2. **Library model**: Sketchfab search (downloadable car models), GLB import into your storage, licence attribution shown.
3. **AI generation**: Meshy multi-image-to-3D from your front ¾, side and rear ¾ photos; progress is polled; the result is labelled *"AI-generated approximation, not a scan"*.

Imported and generated models need **owner approval** and show *pending review* until then. For GLB models, mods appear as clickable hotspots projected from anchor points. Non-visual mods (tune, intake, turbo, interior) always appear as hotspots.

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
While the Drive screen is open, a low-cost location watch looks for sustained speed above a threshold, then asks or auto-starts according to your settings. Auto-started drives stop after a configurable idle time. **Limitation:** browsers suspend geolocation in the background, so true background detection needs a native wrapper (e.g. Capacitor with a background-geolocation plugin). The recorder and analysis modules are UI-independent, so they're ready for that.

### OBD-II
`Elm327` connects over BLE GATT, initialises the adapter (`ATZ`, `ATE0`, `ATSP0`…), reads the supported-PID bitmaps (`0100`/`0120`), and polls **only supported PIDs**: RPM, speed, throttle, load, coolant, IAT, MAP, MAF, timing and fuel level. Unsupported PIDs appear as "n/a, unsupported", never as zero. OBD speed replaces GPS speed for timing while connected.

### QR codes
Each vehicle has a random 18-hex-character `slug`. The QR encodes only `/v/<slug>`, rendered client-side (PNG 1024 px and SVG download, or the Web Share API). The page shows only what RLS lets an anonymous visitor read. A private vehicle shows "unavailable" without confirming it exists.

---

## Extending
- New mod categories: add to `MOD_CATEGORIES` (`src/lib/types.ts`), map visual ones in `CATEGORY_PART` / `PIN_ANCHOR`.
- New visual part: add geometry in `ProceduralCar.tsx`, a field in `ModelConfig`, and a control in `ModelConfigurator.tsx`.
- New OBD channel: add a `PidDef` in `src/lib/obd/elm327.ts` and a column in `drive_samples`.
- Map matching or real road classification: post-process `drive_samples` server-side (Mapbox Map Matching, OSRM) and write results to `drives.segments` with a new `basis` value.
