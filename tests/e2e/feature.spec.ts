import { expect, test } from "@playwright/test";
import { openTwoPeers } from "@baditaflorin/mesh-common/testing";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
  name: string;
};
const storagePrefix = pkg.name;

test("organizer sets 3 steps; player claims them in order and finishes", async ({
  browser,
  baseURL,
}) => {
  const { a, b, cleanup } = await openTwoPeers(browser, baseURL ?? "", { storagePrefix });
  try {
    await a.getByPlaceholder("your name").fill("alice");
    await a.locator('input[type="number"]').fill("3");
    await a.getByRole("button", { name: "configure", exact: true }).click();

    await b.getByPlaceholder("your name").fill("bob");
    await expect(b.locator(".viral-status").first()).toContainText("3 steps");

    await b.getByText("paste a step payload").click();
    for (let i = 1; i <= 3; i++) {
      await b.getByPlaceholder("paste mesh://room/STEP#N").fill(`mesh://e2e/STEP#${i}`);
      await b.getByRole("button", { name: "claim", exact: true }).click();
    }

    await expect(b.locator(".th-finish")).toContainText("you finished");
  } finally {
    await cleanup();
  }
});

// Load-bearing assertion #1: the "ordered" claim. An out-of-order scan must be
// rejected and must NOT advance progress. Drives the scanner's payload path via
// the in-room paste fallback (a camera cannot run headless), exactly the same
// parseScanPayload → claimStep path the real QR scan uses.
test("out-of-order scan is rejected and does not advance progress", async ({
  browser,
  baseURL,
}) => {
  const { a, b, cleanup } = await openTwoPeers(browser, baseURL ?? "", { storagePrefix });
  try {
    await a.getByPlaceholder("your name").fill("alice");
    await a.locator('input[type="number"]').fill("3");
    await a.getByRole("button", { name: "configure", exact: true }).click();

    await b.getByPlaceholder("your name").fill("bob");
    await expect(b.locator(".viral-status").first()).toContainText("3 steps");
    await b.getByText("paste a step payload").click();

    // Progress starts at 0/3.
    await expect(b.getByRole("heading", { name: /progress: 0\/3/ })).toBeVisible();

    // Scanning step 1 first is in-order → advances to 1/3.
    await b.getByPlaceholder("paste mesh://room/STEP#N").fill("mesh://e2e/STEP#1");
    await b.getByRole("button", { name: "claim", exact: true }).click();
    await expect(b.getByRole("heading", { name: /progress: 1\/3/ })).toBeVisible();

    // Now scan step 3 OUT OF ORDER (expected 2). It must be rejected, surface an
    // error, and leave progress pinned at 1/3.
    await b.getByPlaceholder("paste mesh://room/STEP#N").fill("mesh://e2e/STEP#3");
    await b.getByRole("button", { name: "claim", exact: true }).click();
    await expect(b.locator(".mesh-qrx-error")).toContainText("expected step 2 but scanned 3");
    await expect(b.getByRole("heading", { name: /progress: 1\/3/ })).toBeVisible();
    // Definitely not finished.
    await expect(b.locator(".th-finish")).toHaveCount(0);
  } finally {
    await cleanup();
  }
});

// Load-bearing assertion #2 (the heart of the task): completing the ordered set
// marks the peer a winner, and that winner is visible CROSS-PEER. Peer B scans
// all steps in order; peer A — the OPPOSITE peer — must see B land in the
// shared 🏁 finished board. Fails on any regression that keeps the finish state
// local (e.g. progress in useState instead of the players Y.Map); passes only
// when players.set(peerId, {finishedAt}) genuinely crosses the mesh.
test("B completes the ordered hunt → A sees B in the cross-peer finished board", async ({
  browser,
  baseURL,
}) => {
  const { a, b, cleanup } = await openTwoPeers(browser, baseURL ?? "", { storagePrefix });
  try {
    await a.getByPlaceholder("your name").fill("alice");
    await a.locator('input[type="number"]').fill("3");
    await a.getByRole("button", { name: "configure", exact: true }).click();

    await b.getByPlaceholder("your name").fill("bob");
    await expect(b.locator(".viral-status").first()).toContainText("3 steps");

    // Before B finishes, A's finished board reads "nobody yet".
    await expect(a.locator(".viral-empty")).toContainText("nobody yet");

    // B scans all 3 posters IN ORDER via the in-room payload path.
    await b.getByText("paste a step payload").click();
    for (let i = 1; i <= 3; i++) {
      await b.getByPlaceholder("paste mesh://room/STEP#N").fill(`mesh://e2e/STEP#${i}`);
      await b.getByRole("button", { name: "claim", exact: true }).click();
    }
    await expect(b.locator(".th-finish")).toContainText("you finished");

    // Peer A — the opposite peer — must now see bob as a winner in the shared
    // finished board.
    await expect(a.getByRole("heading", { name: /🏁 finished \(1\)/ })).toBeVisible();
    await expect(a.locator(".th-board")).toContainText("bob");
  } finally {
    await cleanup();
  }
});
