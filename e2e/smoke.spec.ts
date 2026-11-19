import { expect, test } from "@playwright/test";

// Pages that must work for signed-out visitors, with or without a database behind them.

test("landing page explains the app and links to sign-up", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator("h1")).toBeVisible();
  await expect(page.getByRole("link", { name: /start your garage/i })).toHaveAttribute("href", "/signup");
  await expect(page.getByRole("link", { name: /privacy/i }).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("privacy policy and terms are reachable", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/privacy/i);
  await page.goto("/terms");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/terms/i);
});

test("sign-up form has the consent line and validates usernames before calling the server", async ({ page }) => {
  await page.goto("/signup");
  await expect(page.getByText(/16 or older/)).toBeVisible();
  await page.getByLabel("Username").fill("No Spaces!");
  await page.getByLabel("Email").fill("someone@example.com");
  await page.getByLabel("Password").fill("long-enough-password");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator("form [role=alert]")).toContainText(/3–24 characters/);
});

test("sign-in page offers password reset", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: /forgot password/i }).click();
  await expect(page).toHaveURL(/\/forgot/);
});

test("signed-out visitors can't reach the app", async ({ page }) => {
  await page.goto("/garage");
  await expect(page).toHaveURL(/\/(login|setup)/);
});

test("a made-up invite code says it doesn't work", async ({ page }) => {
  await page.goto("/invite/NOTAREALCODE");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/doesn.t work/i);
});

test("unknown pages get a 404", async ({ page }) => {
  const res = await page.goto("/this-page-does-not-exist");
  expect(res?.status()).toBe(404);
});
