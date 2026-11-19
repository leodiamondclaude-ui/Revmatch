# RevMatch phone app

Records drives with the screen off and uploads them to your RevMatch garage. Built with Expo (SDK 58).

## Why there's a phone app

The website can record drives, but browsers pause GPS when the screen locks, and iPhones can't talk to Bluetooth OBD-II adapters from a browser at all. This app fixes both:

- **Background GPS**: about one point a second, with a "Recording your drive" notification on Android and the blue location pill on iPhone.
- **OBD-II over Bluetooth LE on iPhone and Android**: RPM, speed, coolant, throttle, load and intake temperature. Only the readings your car actually reports are shown.
- **Offline first**: the drive is saved on the phone while you drive and uploaded when you stop. If there's no signal, it uploads next time the app opens. Uploads resume where they stopped.
- **One copy of the maths**: after uploading, the app asks the website (`POST /api/drives/:id/finalize`) to analyse the drive with the same code the web recorder uses. Phone drives and web drives get identical reports and privacy trimming.

## Run it

Background location and Bluetooth are native modules, so **Expo Go won't work**. You need a development build.

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in the same public Supabase URL and anon key as the website, plus the website's address.

3. Build. Option A is the cloud build (no Xcode or Android Studio needed):

   ```bash
   npx eas-cli@latest build --profile development --platform ios
   ```

   ```bash
   npx eas-cli@latest build --profile development --platform android
   ```

   Option B is a local build, with Xcode or Android Studio installed:

   ```bash
   npx expo run:ios
   ```

   ```bash
   npx expo run:android
   ```

4. Start the bundler and open the dev build on your phone:

   ```bash
   npx expo start
   ```

For a TestFlight or Play internal build, use `--profile preview`, or `production` for the stores. EAS environment variables (or the `.env` file at build time) provide the `EXPO_PUBLIC_*` values.

## What to test on a real phone

These can't be checked in CI:

- **Permissions**: start a drive, choose "Allow while using", then upgrade to "Always" when asked. On Android, allow notifications so the foreground-service notice shows.
- **Screen off**: lock the phone for a few minutes mid-drive. The point count should keep rising, and the drive on the website should have no gap.
- **Force-quit mid-drive**: reopen the app. It should say the drive stopped and upload what it had.
- **Airplane mode**: end a drive offline. It shows under "Waiting to upload" and goes up once you're back online.
- **OBD**: with the ignition on, Connect lists the adapter. RPM and coolant should appear, and the drive is saved as "GPS + OBD".

## App store notes

- **Apple**: background location needs a clear reason in review. The permission text in `app.json` explains it, and recording only runs while a drive is active.
- **Google Play**: requires the background location declaration form and a short video showing the "Start drive" flow.
