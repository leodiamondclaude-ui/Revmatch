import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { supabase } from "../lib/supabase";
import { configured, SITE_URL } from "../lib/config";
import { C } from "../lib/theme";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function signIn() {
    setBusy(true); setErr(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setErr(error.message);
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.wrap}>
      <View style={s.card}>
        <Text style={s.brand}>REVMATCH</Text>
        <Text style={s.h1}>Record your drives</Text>
        <Text style={s.p}>Sign in with your RevMatch account. Drives you record here show up in your garage on the website.</Text>
        {!configured && <Text style={s.err}>This build is missing its Supabase settings (EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, EXPO_PUBLIC_SITE_URL).</Text>}
        <TextInput style={s.input} placeholder="Email" placeholderTextColor={C.dim} autoCapitalize="none" autoComplete="email" keyboardType="email-address" value={email} onChangeText={setEmail} />
        <TextInput style={s.input} placeholder="Password" placeholderTextColor={C.dim} secureTextEntry autoComplete="password" value={password} onChangeText={setPassword} onSubmitEditing={signIn} />
        {err && <Text style={s.err}>{err}</Text>}
        <Pressable style={[s.btn, (busy || !email || !password) && { opacity: 0.5 }]} disabled={busy || !email || !password} onPress={signIn}>
          {busy ? <ActivityIndicator color="#000" /> : <Text style={s.btnText}>Sign in</Text>}
        </Pressable>
        {!!SITE_URL && (
          <Pressable onPress={() => Linking.openURL(`${SITE_URL}/signup`)}><Text style={s.link}>New here? Create an account on the website</Text></Pressable>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.bg, justifyContent: "center", padding: 20 },
  card: { backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 20, gap: 12 },
  brand: { color: C.accent, fontWeight: "900", letterSpacing: 3, fontStyle: "italic" },
  h1: { color: C.ink, fontSize: 28, fontWeight: "900", fontStyle: "italic", textTransform: "uppercase" },
  p: { color: C.muted, fontSize: 14, lineHeight: 20 },
  input: { backgroundColor: C.surface2, borderColor: C.line, borderWidth: 1, borderRadius: 10, color: C.ink, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  btn: { backgroundColor: C.accent, borderRadius: 10, paddingVertical: 14, alignItems: "center" },
  btnText: { color: "#000", fontWeight: "800", textTransform: "uppercase", letterSpacing: 1 },
  err: { color: C.bad, fontSize: 14 },
  link: { color: C.accent, textAlign: "center", paddingVertical: 6 },
});
