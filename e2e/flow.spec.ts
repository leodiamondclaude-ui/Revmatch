import { expect, test, type Page } from "@playwright/test";

// The real thing against a real Supabase: two people sign up through an invite, post, like,
// get notified, report, and block. Needs E2E_FULL=1 and a Supabase with email confirmation off
// (the local one CI starts with `supabase start`).
test.skip(!process.env.E2E_FULL, "set E2E_FULL=1 with a real Supabase to run the full flow");
test.describe.configure({ mode: "serial" });

const run = Date.now().toString(36);
const alice = { username: `alice_${run}`, email: `alice_${run}@example.test`, password: "correct-horse-battery" };
const bob = { username: `bob_${run}`, email: `bob_${run}@example.test`, password: "correct-horse-battery" };
let inviteUrl = "";

async function signUp(page: Page, who: typeof alice) {
  await expect(page.getByLabel("Username")).toBeVisible();
  await page.getByLabel("Username").fill(who.username);
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Password").fill(who.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/garage\/new/);
}
async function signIn(page: Page, who: typeof alice) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Password").fill(who.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/dashboard/);
}

test("alice signs up and makes an invite link", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/signup");
  await signUp(page, alice);
  await page.goto("/friends/invite");
  await page.getByRole("button", { name: /make a link/i }).click();
  const link = page.locator("li .font-mono").filter({ hasText: "/invite/" }).first();
  await expect(link).toBeVisible();
  inviteUrl = (await link.textContent())!.trim();
  expect(inviteUrl).toMatch(/\/invite\/[A-Za-z0-9]{6,16}$/);
});

test("bob joins through the invite and is already alice's friend", async ({ page }) => {
  await page.goto(inviteUrl);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("invited you");
  await page.getByRole("link", { name: "Create my account" }).click();
  await expect(page.getByText(/signing up with an invite/i)).toBeVisible();
  await signUp(page, bob);
  await page.goto("/friends");
  await expect(page.getByText(`@${alice.username}`)).toBeVisible();
});

test("alice posts; bob likes it and reports it", async ({ browser }) => {
  const a = await (await browser.newContext()).newPage();
  await signIn(a, alice);
  await a.goto("/feed");
  await a.getByPlaceholder("What's new with the build?").fill(`Cleaned the car ${run}`);
  await a.getByRole("button", { name: "Post", exact: true }).click();
  await expect(a.getByText(`Cleaned the car ${run}`)).toBeVisible();

  const b = await (await browser.newContext()).newPage();
  await signIn(b, bob);
  await b.goto("/feed");
  const post = b.locator("article").filter({ hasText: `Cleaned the car ${run}` });
  await post.getByRole("button", { name: "Like" }).click();
  await expect(post.getByRole("button", { name: "Unlike" })).toBeVisible();
  await post.getByRole("button", { name: /report this post/i }).click();
  await b.getByRole("button", { name: "Send report" }).click();
  await expect(b.getByText(/a moderator will look at it/i)).toBeVisible();

  // Alice sees both notifications.
  await a.goto("/notifications");
  await expect(a.getByText("joined RevMatch with your invite")).toBeVisible();
  await expect(a.getByText("liked your post")).toBeVisible();
});

test("blocking hides alice's profile content from bob", async ({ browser }) => {
  const a = await (await browser.newContext()).newPage();
  await signIn(a, alice);
  await a.goto(`/u/${bob.username}`);
  a.once("dialog", (d) => d.accept());
  await a.getByRole("button", { name: "Block" }).click();
  await expect(a.getByRole("button", { name: "Unblock" })).toBeVisible();

  const b = await (await browser.newContext()).newPage();
  await signIn(b, bob);
  await b.goto("/feed?tab=discover");
  await expect(b.getByText(`Cleaned the car ${run}`)).toHaveCount(0);
});

test("data export downloads JSON with the account in it", async ({ browser }) => {
  const b = await (await browser.newContext()).newPage();
  await signIn(b, bob);
  const res = await b.request.get("/api/account/export");
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  expect(json.profile.username).toBe(bob.username);
});
