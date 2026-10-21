import { expect, test, type Page } from "@playwright/test";

/** Make the moves a person would, whenever the table asks for one. */
async function takeTurnIfAny(page: Page): Promise<void> {
  const choices = [
    page.getByRole("button", { name: /^Flip your/ }),
    page.getByRole("button", { name: "Draw from the deck" }),
    page.getByRole("button", { name: "Discard the card you drew" }),
  ];
  for (const choice of choices) {
    if ((await choice.count()) > 0) {
      // The table can change under us between looking and clicking.
      await choice
        .first()
        .click({ timeout: 2_000 })
        .catch(() => {});
      return;
    }
  }
}

async function joinTable(
  page: Page,
  name: string,
  avatar: string,
): Promise<void> {
  await page.getByLabel("Your name").fill(name);
  await page.getByRole("button", { name: avatar }).click();
  await page.getByRole("button", { name: "Ready" }).click();
}

test("a host and a guest play a whole game together", async ({ browser }) => {
  const host = await (await browser.newContext()).newPage();
  const guest = await (await browser.newContext()).newPage();
  const problems: string[] = [];
  for (const [who, page] of [
    ["host", host],
    ["guest", guest],
  ] as const) {
    page.on("pageerror", (e) => problems.push(`${who}: ${e.message}`));
  }

  // The host makes a two-player room with no bots.
  await host.goto("/host");
  await host.getByLabel("Max players").selectOption("2");
  await host.getByLabel("Holes").selectOption("3");
  await host.getByLabel("Bots").selectOption("off");
  await host.getByRole("button", { name: "Create Room" }).click();
  await joinTable(host, "Hosty", "Visor");
  const code = (await host.getByTestId("room-code").innerText()).trim();
  expect(code).toMatch(/^[A-Z0-9]{5}$/);

  // The guest joins with the code and takes a different avatar.
  await guest.goto("/");
  await guest.getByLabel("Room code").fill(code);
  await guest.getByRole("button", { name: "Join" }).click();
  await expect(guest.getByTestId("room-code")).toHaveText(code);
  await joinTable(guest, "Guesty", "Teal");

  // Each sees the other in the room, and only the host can start.
  await expect(host.getByRole("list", { name: "Players" })).toContainText(
    "Guesty",
  );
  await expect(guest.getByRole("list", { name: "Players" })).toContainText(
    "Hosty",
  );
  await expect(guest.getByRole("button", { name: "Start Game" })).toHaveCount(
    0,
  );
  await host.getByRole("button", { name: "Start Game" }).click();
  await expect(host.getByRole("group", { name: "Piles" })).toBeVisible();
  await expect(guest.getByRole("group", { name: "Piles" })).toBeVisible();

  // Both play until the game ends. The host starts each following hole.
  const gameOver = (page: Page) =>
    page.getByRole("heading", { name: "Game over" });
  let sawGuestWaiting = false;
  const deadline = Date.now() + 100_000;
  while (Date.now() < deadline) {
    if (
      (await gameOver(host).count()) > 0 &&
      (await gameOver(guest).count()) > 0
    )
      break;

    const next = host.getByRole("button", { name: /^Start hole/ });
    if ((await next.count()) > 0) {
      sawGuestWaiting ||=
        (await guest.getByText(/Waiting for the host to start hole/).count()) >
        0;
      await next.click({ timeout: 2_000 }).catch(() => {});
    }
    await takeTurnIfAny(host);
    await takeTurnIfAny(guest);
    await host.waitForTimeout(100);
  }

  await expect(gameOver(host)).toBeVisible();
  await expect(gameOver(guest)).toBeVisible();
  expect(sawGuestWaiting, "the guest waits for the host between holes").toBe(
    true,
  );

  // Both screens agree on who won, and only the host can start another game.
  const verdict = async (page: Page, me: string) =>
    (await page.getByRole("status").innerText()).replace(
      "You win!",
      `${me} wins!`,
    );
  const hostVerdict = await verdict(host, "Hosty");
  expect(hostVerdict).toMatch(/wins!|tie!/);
  expect(await verdict(guest, "Guesty")).toBe(hostVerdict);
  await expect(guest.getByRole("button", { name: "Play Again" })).toHaveCount(
    0,
  );

  await host.getByRole("button", { name: "Play Again" }).click();
  await expect(host.getByRole("group", { name: "Piles" })).toBeVisible();
  await expect(guest.getByRole("group", { name: "Piles" })).toBeVisible();

  expect(problems).toEqual([]);
});
