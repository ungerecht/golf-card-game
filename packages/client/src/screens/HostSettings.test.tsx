import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@golf/shared";
import { FakeConnector } from "../test/fakes";
import { renderApp } from "../test/render";

describe("room settings", () => {
  it("starts from the default settings", () => {
    renderApp("/host");
    expect(screen.getByLabelText("Max players")).toHaveValue("4");
    expect(screen.getByLabelText("Holes")).toHaveValue("9");
    expect(screen.getByLabelText("Bots")).toHaveValue("off");
    expect(screen.getByLabelText("Bot difficulty")).toHaveValue("normal");
  });

  it("only allows a bot difficulty when bots are on", async () => {
    const { user } = renderApp("/host");
    expect(screen.getByLabelText("Bot difficulty")).toBeDisabled();
    await user.selectOptions(screen.getByLabelText("Bots"), "on");
    expect(screen.getByLabelText("Bot difficulty")).toBeEnabled();
  });

  it("offers only the allowed choices", () => {
    renderApp("/host");
    const options = (label: string) =>
      [...(screen.getByLabelText(label) as HTMLSelectElement).options].map(
        (o) => o.value,
      );
    expect(options("Max players")).toEqual(["2", "3", "4"]);
    expect(options("Holes")).toEqual(["3", "6", "9"]);
  });

  it("creates the room with the chosen settings and opens the waiting room", async () => {
    const { user, connector } = renderApp("/host");
    await user.selectOptions(screen.getByLabelText("Max players"), "3");
    await user.selectOptions(screen.getByLabelText("Holes"), "6");
    await user.selectOptions(screen.getByLabelText("Bots"), "on");
    await user.selectOptions(screen.getByLabelText("Bot difficulty"), "easy");
    await user.click(screen.getByRole("button", { name: "Create Room" }));

    expect(connector.created).toEqual([
      {
        ...DEFAULT_SETTINGS,
        maxPlayers: 3,
        holes: 6,
        bots: true,
        botDifficulty: "easy",
      },
    ]);
    expect(
      await screen.findByRole("heading", { name: "Waiting room" }),
    ).toBeInTheDocument();
  });

  it("stays here with a message when the room cannot be created", async () => {
    const connector = new FakeConnector();
    connector.failCreate = true;
    const { user } = renderApp("/host", connector);
    await user.click(screen.getByRole("button", { name: "Create Room" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/server/i);
    expect(
      screen.getByRole("heading", { name: "Room settings" }),
    ).toBeInTheDocument();
  });

  it("goes back to the landing page", async () => {
    const { user } = renderApp("/host");
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(
      screen.getByRole("heading", { name: "Six Card Golf" }),
    ).toBeInTheDocument();
  });
});
