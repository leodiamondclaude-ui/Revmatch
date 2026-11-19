import * as SQLite from "expo-sqlite";

/**
 * Drives are recorded to the phone first and uploaded afterwards, so a dead zone or a flat battery
 * never loses a drive. Samples use the same fields as the website's drive_samples table.
 */
export const db = SQLite.openDatabaseSync("revmatch.db");
db.execSync(`
  pragma journal_mode = wal;
  create table if not exists drives (
    id integer primary key autoincrement,
    remote_id text,
    vehicle_id text,
    started_at integer not null,
    ended_at integer,
    start_mode text not null default 'manual',
    has_obd integer not null default 0,
    status text not null default 'recording', -- recording | stopped | uploaded | discarded
    error text
  );
  create table if not exists samples (
    id integer primary key autoincrement,
    drive integer not null,
    t integer not null,
    lat real, lng real, altitude real, altitude_accuracy real, accuracy real,
    gps_speed real, heading real,
    rpm real, coolant_c real, throttle_pct real, engine_load_pct real, intake_temp_c real, obd_speed_kph real,
    uploaded integer not null default 0
  );
  create index if not exists samples_drive on samples (drive, uploaded, t);
`);

export type LocalDrive = { id: number; remote_id: string | null; vehicle_id: string | null; started_at: number; ended_at: number | null; start_mode: string; has_obd: number; status: string; error: string | null };
export type LocalSample = {
  t: number; lat: number | null; lng: number | null; altitude: number | null; altitude_accuracy: number | null; accuracy: number | null;
  gps_speed: number | null; heading: number | null; rpm?: number | null; coolant_c?: number | null; throttle_pct?: number | null;
  engine_load_pct?: number | null; intake_temp_c?: number | null; obd_speed_kph?: number | null;
};

export const activeDrive = () => db.getFirstAsync<LocalDrive>("select * from drives where status = 'recording' order by id desc limit 1");

export async function addSamples(drive: number, rows: LocalSample[]) {
  if (!rows.length) return;
  await db.withTransactionAsync(async () => {
    for (const s of rows) {
      await db.runAsync(
        `insert into samples (drive, t, lat, lng, altitude, altitude_accuracy, accuracy, gps_speed, heading, rpm, coolant_c, throttle_pct, engine_load_pct, intake_temp_c, obd_speed_kph)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        drive, s.t, s.lat, s.lng, s.altitude, s.altitude_accuracy, s.accuracy, s.gps_speed, s.heading,
        s.rpm ?? null, s.coolant_c ?? null, s.throttle_pct ?? null, s.engine_load_pct ?? null, s.intake_temp_c ?? null, s.obd_speed_kph ?? null,
      );
    }
  });
}
