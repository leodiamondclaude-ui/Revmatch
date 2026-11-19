import "../lib/recorder"; // registers the background location task before anything else runs
import { useEffect, useState } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { C } from "../lib/theme";

export default function RootLayout() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session === undefined) return;
    const onLogin = segments[0] === "login";
    if (!session && !onLogin) router.replace("/login");
    if (session && onLogin) router.replace("/");
  }, [session, segments, router]);

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerStyle: { backgroundColor: C.bg }, headerTintColor: C.ink, contentStyle: { backgroundColor: C.bg }, headerShadowVisible: false }}>
        <Stack.Screen name="index" options={{ title: "Drive" }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="obd" options={{ title: "OBD-II adapter", presentation: "modal" }} />
      </Stack>
    </>
  );
}
