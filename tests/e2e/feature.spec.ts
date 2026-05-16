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
