import { CONTACT, LEGAL_UPDATED, OPERATOR } from "@/lib/legal";

export const metadata = { title: "Terms of service" };

export default function Terms() {
  return (
    <article className="space-y-5 text-[15px] leading-relaxed text-ink/90 [&_h2]:h-display [&_h2]:mt-8 [&_h2]:text-2xl [&_li]:ml-5 [&_li]:list-disc">
      <h1 className="h-display text-4xl">Terms of service</h1>
      <p className="text-sm text-muted">Last updated {LEGAL_UPDATED}. These terms are between you and {OPERATOR}.</p>
      <p className="rounded-lg border border-warn/40 bg-warn/10 p-3 text-sm">Template: have a lawyer review these before launch.</p>

      <h2>Using RevMatch</h2>
      <ul>
        <li>You must be 16 or older and give accurate account details.</li>
        <li>You&apos;re responsible for your account and what you post.</li>
      </ul>

      <h2>Drive safely and legally</h2>
      <p><b>Never use RevMatch while driving.</b> Set it up before you leave and let it record. Speed figures, lap times and 0–60 runs are for private tracks and closed courses: don&apos;t break traffic laws to log a number. Telemetry comes from your phone and adapter and can be wrong; don&apos;t rely on it for safety.</p>

      <h2>Your content</h2>
      <ul>
        <li>You keep ownership of the photos, text and data you add. You give us permission to store and show them as your privacy settings allow, so the service works.</li>
        <li>Only post photos you took or have the right to share.</li>
        <li>Don&apos;t post content that is illegal, hateful, harassing, sexual, violent, spam, or that pretends to be someone else, or that shows or encourages dangerous driving on public roads.</li>
      </ul>

      <h2>AI suggestions and 3D models</h2>
      <p>AI suggestions (identification, colours, specs) and 3D models are approximations, not facts or scans. Check them before you rely on them. 3D models from other creators stay under their licences, and credits are shown on your car page.</p>

      <h2>Moderation</h2>
      <p>Anyone can report content. We may remove content or suspend accounts that break these terms. If you think we got it wrong, contact {CONTACT}.</p>

      <h2>The service</h2>
      <p>RevMatch is provided as it is. We work to keep it running and your data safe, but we can&apos;t promise it will always be available or error-free. To the extent the law allows, we&apos;re not liable for indirect losses. Nothing here limits rights you have by law.</p>

      <h2>Ending</h2>
      <p>You can delete your account at any time in Settings. We may close accounts that seriously or repeatedly break these terms.</p>

      <h2>Contact</h2>
      <p>{CONTACT}</p>
    </article>
  );
}
