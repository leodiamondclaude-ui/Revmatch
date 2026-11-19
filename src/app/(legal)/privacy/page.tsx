import Link from "next/link";
import { CONTACT, LEGAL_UPDATED, OPERATOR } from "@/lib/legal";

export const metadata = { title: "Privacy policy" };

export default function Privacy() {
  return (
    <article className="space-y-5 text-[15px] leading-relaxed text-ink/90 [&_h2]:h-display [&_h2]:mt-8 [&_h2]:text-2xl [&_li]:ml-5 [&_li]:list-disc">
      <h1 className="h-display text-4xl">Privacy policy</h1>
      <p className="text-sm text-muted">Last updated {LEGAL_UPDATED}. This policy describes how {OPERATOR} handles your data on RevMatch.</p>
      <p className="rounded-lg border border-warn/40 bg-warn/10 p-3 text-sm">Template: have a lawyer review this for your location (for example GDPR in the UK/EU, CCPA in California) before launch.</p>

      <h2>What we collect</h2>
      <ul>
        <li><b>Account:</b> your email, username, and the profile details you add (name, bio, location, avatar).</li>
        <li><b>Your cars:</b> year, make, model, specs, mods, costs, photos, 3D models and the build sheet you fill in. Your VIN, licence plate, purchase price and private notes are stored separately and only you can see them.</li>
        <li><b>Drives:</b> while you record a drive, your phone&apos;s GPS position, speed, altitude and motion, and (if you connect an OBD-II adapter) engine data such as RPM and coolant temperature. Raw GPS points are only readable by you.</li>
        <li><b>Social:</b> posts, comments, likes, follows, friends, blocks and reports you make.</li>
        <li><b>Usage limits:</b> a count of AI requests per day, to prevent abuse.</li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>To run the service: show your garage, record and analyse drives, and power the social features.</li>
        <li><b>AI features:</b> when you ask us to read your car photos or look up factory specs, the photos or car details are sent to Anthropic (Claude) to produce suggestions. You confirm everything before it&apos;s saved.</li>
        <li><b>3D models:</b> to find or build a model of your car we send its year, make, model and visible mods to Sketchfab and, where used, Meshy. Photos are not sent to them by these features.</li>
        <li>To keep the service safe: moderators review reported content.</li>
      </ul>
      <p>We don&apos;t sell your data or use it for advertising.</p>

      <h2>Who can see what</h2>
      <ul>
        <li>Each car is public, friends-only or private, as you choose. Public cars can be opened by anyone with the link or QR code.</li>
        <li>Drives are private unless you share them. Shared route maps have the stretches near the start and finish removed so they don&apos;t reveal your home or workplace.</li>
        <li>You can hide your location, mileage, mod costs and service history on each car.</li>
      </ul>

      <h2>Where it&apos;s stored</h2>
      <p>Data is stored with Supabase (database, authentication and file storage) and the site is hosted on Vercel. AI requests go to Anthropic; 3D model searches and generation go to Sketchfab and Meshy. Each acts as our processor under their own terms.</p>

      <h2>How long we keep it</h2>
      <p>We keep your data while your account exists. When you delete your account, your profile, cars, photos, models, drives, posts, comments and connections are deleted straight away. Backups roll over within the retention period of our database provider.</p>

      <h2>Your choices and rights</h2>
      <ul>
        <li><b>Download your data</b> and <b>delete your account</b> at any time from <Link href="/settings" className="text-accent">Settings</Link>.</li>
        <li>Correct anything in your profile and cars yourself, or ask us to.</li>
        <li>Depending on where you live you may have further rights (to object, restrict or complain to a regulator). Contact us at {CONTACT}.</li>
      </ul>

      <h2>Age</h2>
      <p>RevMatch is for people aged 16 and over.</p>

      <h2>Changes</h2>
      <p>If we change this policy in a meaningful way, we&apos;ll tell you in the app before it takes effect.</p>
    </article>
  );
}
