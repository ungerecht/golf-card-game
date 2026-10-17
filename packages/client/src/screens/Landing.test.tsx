import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FakeConnector } from "../test/fakes";
import { renderApp } from "../test/render";
import { cleanCode } from "./cleanCode";

describe("cleanCode", () => {
  it("capitalises, drops characters that never appear in codes, and caps the length", () => {
    expect(cleanCode("ab c-d1")).toBe("ABCD");
    expect(cleanCode("abcdefgh")).toBe("ABCDE");
  });
});

describe("landing page", () => {
  it("shows the title, a code field and the two buttons", () => {
    renderApp("/");
    expect(
      screen.getByRole("heading", { name: "Six Card Golf" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Room code")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Join" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Host" })).toBeEnabled();
  });

  it("formats the code as it is typed and enables Join once it is complete", async () => {
    const { user } = renderApp("/");
    const field = screen.getByLabelText("Room code");
    await user.type(field, "abc");
    expect(field).toHaveValue("ABC");
    expect(screen.getByRole("button", { name: "Join" })).toBeDisabled();
    await user.type(field, "de");
    expect(field).toHaveValue("ABCDE");
    expect(screen.getByRole("button", { name: "Join" })).toBeEnabled();
  });

  it("goes to the waiting room for a code that is open", async () => {
    const { user, connector } = renderApp("/");
    await user.type(screen.getByLabelText("Room code"), "abcde");
    await user.click(screen.getByRole("button", { name: "Join" }));
    expect(
      await screen.findByRole("heading", { name: "Waiting room" }),
    ).toBeInTheDocument();
    expect(connector.joined).toEqual(["ABCDE"]);
  });

  it.each([
    ["missing", /could not find/i],
    ["full", /full/i],
    ["started", /already started/i],
  ] as const)(
    "stays put with a message for a %s room",
    async (status, text) => {
      const connector = new FakeConnector();
      connector.status = status;
      const { user } = renderApp("/", connector);
      await user.type(screen.getByLabelText("Room code"), "abcde");
      await user.click(screen.getByRole("button", { name: "Join" }));
      expect(await screen.findByRole("alert")).toHaveTextContent(text);
      expect(
        screen.getByRole("heading", { name: "Six Card Golf" }),
      ).toBeInTheDocument();
      expect(connector.joined).toEqual([]);
    },
  );

  it("clears the message when the code is edited", async () => {
    const connector = new FakeConnector();
    connector.status = "missing";
    const { user } = renderApp("/", connector);
    const field = screen.getByLabelText("Room code");
    await user.type(field, "abcde");
    await user.click(screen.getByRole("button", { name: "Join" }));
    await screen.findByRole("alert");
    await user.type(field, "{Backspace}");
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("goes to the room settings from Host", async () => {
    const { user } = renderApp("/");
    await user.click(screen.getByRole("button", { name: "Host" }));
    expect(
      screen.getByRole("heading", { name: "Room settings" }),
    ).toBeInTheDocument();
  });
});
