import "react-native-url-polyfill/auto";
import * as SecureStore from "expo-secure-store";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

/**
 * Sessions are kept in the device keychain/keystore. Some platforms cap a single entry at ~2 KB and a
 * Supabase session can be larger, so values are split into chunks.
 */
const CHUNK = 1800;
const keychain = {
  async getItem(key: string) {
    const n = Number(await SecureStore.getItemAsync(`${key}.n`));
    if (!n) return SecureStore.getItemAsync(key);
    const parts: string[] = [];
    for (let i = 0; i < n; i++) parts.push((await SecureStore.getItemAsync(`${key}.${i}`)) ?? "");
    return parts.join("");
  },
  async setItem(key: string, value: string) {
    await keychain.removeItem(key);
    const n = Math.ceil(value.length / CHUNK);
    for (let i = 0; i < n; i++) await SecureStore.setItemAsync(`${key}.${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK));
    await SecureStore.setItemAsync(`${key}.n`, String(n));
  },
  async removeItem(key: string) {
    const n = Number(await SecureStore.getItemAsync(`${key}.n`));
    for (let i = 0; i < n; i++) await SecureStore.deleteItemAsync(`${key}.${i}`);
    await SecureStore.deleteItemAsync(`${key}.n`);
    await SecureStore.deleteItemAsync(key);
  },
};

export const supabase = createClient(SUPABASE_URL || "http://localhost", SUPABASE_ANON_KEY || "missing", {
  auth: { storage: keychain, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});
