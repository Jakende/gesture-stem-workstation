import { expect, test } from "@playwright/test";

test("renders the technical instrument shell and supports theme inversion", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Gesture Stem Workstation" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tracks" })).toBeVisible();
  await expect(page.getByText("Add the four local example stems")).toBeVisible();
  await page.getByRole("button", { name: "Invert theme" }).click();
  await expect(page.locator("body")).toHaveClass(/theme-invert/);
});

test("synthetic gesture mode works without a webcam", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Test without camera" }).click();
  await expect(page.getByText("Synthetic test signal", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Disable" })).toBeEnabled();
  await expect(page.locator("#depthReadout")).not.toHaveText("Distance —");
});

test("adds repository stems without replacing existing tracks and clears only on confirmation", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await page.getByRole("button", { name: "Add example stems" }).click();
  await expect(page.getByText("4 tracks")).toBeVisible();
  await expect(page.getByText("4 stems added · 4 tracks ready.")).toBeVisible({ timeout: 110_000 });
  await expect(page.getByRole("button", { name: "Play" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Mute Drums" })).toBeVisible();
  const originalTrackIds = await page.locator(".track-row").evaluateAll((rows) => rows.map((row) => (row as HTMLElement).dataset.trackId));
  await page.getByRole("button", { name: "Add example stems" }).click();
  await expect(page.getByText("4 stems added · 8 tracks ready.")).toBeVisible({ timeout: 110_000 });
  await expect(page.locator(".track-row")).toHaveCount(8);
  await expect.poll(async () => (
    await page.locator(".track-row").evaluateAll((rows) => rows.slice(0, 4).map((row) => (row as HTMLElement).dataset.trackId))
  )).toEqual(originalTrackIds);
  page.once("dialog", (dialog) => { void dialog.accept(); });
  await page.getByRole("button", { name: "Clear track list" }).click();
  await expect(page.locator(".track-row")).toHaveCount(0);
  await expect(page.getByText("Track list cleared. Original audio files remain unchanged.")).toBeVisible();
});

test("arrow-key track selection is explicit and switchable", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await page.getByRole("button", { name: "Add example stems" }).click();
  await page.getByText("4 stems added · 4 tracks ready.").waitFor({ timeout: 110_000 });
  const selection = page.locator("#inspectorHeading");
  await expect(selection).toHaveText("Drums");
  await page.getByLabel("Select tracks with arrow keys").check();
  await page.keyboard.press("ArrowRight");
  await expect(selection).toHaveText("Bass");
  await page.getByLabel("Select tracks with arrow keys").uncheck();
  await page.keyboard.press("ArrowRight");
  await expect(selection).toHaveText("Bass");
  await expect(page.getByLabel("Reverb mix")).toBeVisible();
  await expect(page.getByLabel("High-pass")).toBeVisible();
});

test("arrow-key selection remains authoritative while gesture input is active", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await page.getByRole("button", { name: "Add example stems" }).click();
  await page.getByText("4 stems added · 4 tracks ready.").waitFor({ timeout: 110_000 });
  await page.getByRole("button", { name: "Test without camera" }).click();
  await page.getByLabel("Select tracks with arrow keys").check();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#inspectorHeading")).toHaveText("Bass");
  await page.waitForTimeout(700);
  await expect(page.locator("#inspectorHeading")).toHaveText("Bass");
});

test("camera performance view keeps the stem selector at the bottom and supports fullscreen", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await page.getByRole("button", { name: "Add example stems" }).click();
  await page.getByText("4 stems added · 4 tracks ready.").waitFor({ timeout: 110_000 });
  await expect(page.locator("#effectCanvas")).toBeVisible();
  await expect(page.locator("#hudTrack")).toHaveText("Drums");
  const stageBox = await page.locator(".camera-stage").boundingBox();
  const zonesBox = await page.locator("#trackZones").boundingBox();
  expect(stageBox).not.toBeNull();
  expect(zonesBox).not.toBeNull();
  expect(zonesBox!.height).toBeLessThanOrEqual(48);
  expect(Math.abs((zonesBox!.y + zonesBox!.height) - (stageBox!.y + stageBox!.height))).toBeLessThanOrEqual(2);
  await page.getByRole("button", { name: "Fullscreen", exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.classList.contains("camera-stage") ?? false)).toBe(true);
  await page.getByRole("button", { name: "Exit fullscreen" }).click();
});

test("serves gesture inference assets locally", async ({ request }) => {
  const model = await request.get("/__models/hand_landmarker.task");
  const wasm = await request.get("/__mediapipe_wasm/vision_wasm_internal.wasm");
  expect(model.ok()).toBe(true);
  expect(Number(model.headers()["content-length"])).toBeGreaterThan(1_000_000);
  expect(wasm.ok()).toBe(true);
  expect(wasm.headers()["content-type"]).toBe("application/wasm");
});
