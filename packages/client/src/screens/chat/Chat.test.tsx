import { act, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@golf/shared";
import { lobby, player } from "../../test/fakes";
import { renderApp } from "../../test/render";

const said = (id: number, text: string, playerId = "host"): ChatMessage => ({
  id,
  playerId,
  name: playerId === "host" ? "Ann" : "Ben",
  avatar: "visor",
  text,
  at: id * 1000,
});

/** Be a guest with a seat in the waiting room. */
async function seated() {
  const app = renderApp("/");
  await app.user.type(screen.getByLabelText("Room code"), "abcde");
  await app.user.click(screen.getByRole("button", { name: "Join" }));
  await screen.findByRole("heading", { name: "Waiting room" });
  act(() =>
    app.connector.room.emit(
      "lobby",
      lobby([player("host", "Ann", "visor"), player("me", "Ben", "teal")], {
        hostId: "host",
      }),
    ),
  );
  const say = (...messages: ChatMessage[]) =>
    act(() => {
      for (const m of messages) app.connector.room.emit("chat", m);
    });
  const bar = () => screen.getByRole("button", { name: /^Open chat/ });
  return { ...app, say, bar };
}

describe("room chat", () => {
  it("is only for players with a seat", async () => {
    const app = renderApp("/");
    await app.user.type(screen.getByLabelText("Room code"), "abcde");
    await app.user.click(screen.getByRole("button", { name: "Join" }));
    await screen.findByRole("heading", { name: "Waiting room" });
    expect(screen.queryByRole("button", { name: /^Open chat/ })).toBeNull();
  });

  it("shows only the latest message while closed", async () => {
    const { say, bar } = await seated();
    expect(bar()).toHaveTextContent("No messages yet");
    say(said(1, "first"), said(2, "second"));
    expect(bar()).toHaveTextContent("Ann: second");
    expect(bar()).not.toHaveTextContent("first");
  });

  it("counts messages from others until it is opened", async () => {
    const { say, bar, user } = await seated();
    say(said(1, "hi"), said(2, "hello?"), said(3, "my own", "me"));
    expect(bar()).toHaveTextContent("2 unread");
    await user.click(bar());
    await user.click(screen.getByRole("button", { name: "Close chat" }));
    expect(bar()).not.toHaveTextContent("unread");
    say(said(4, "again"));
    expect(bar()).toHaveTextContent("1 unread");
  });

  it("opens to show the recent messages and a box to type in", async () => {
    const { say, bar, user } = await seated();
    say(said(1, "first"), said(2, "second", "me"));
    await user.click(bar());

    const log = screen.getByRole("log", { name: "Chat history" });
    const lines = within(log).getAllByRole("listitem");
    expect(lines.map((l) => l.textContent)).toEqual([
      "Ann: first",
      "Ben: second",
    ]);
    expect(screen.getByLabelText("Your message")).toHaveFocus();
    // Still in place under the box, so nothing moves, but hidden from view.
    const hiddenBar = screen.getByText(/Open chat/).closest("button");
    expect(hiddenBar).toHaveAttribute("aria-expanded", "true");
  });

  it("sends what you type, trimmed, and clears the box", async () => {
    const { connector, user, bar } = await seated();
    await user.click(bar());
    const send = screen.getByRole("button", { name: "Send" });
    expect(send).toBeDisabled();

    await user.type(screen.getByLabelText("Your message"), "   ");
    expect(send).toBeDisabled();

    await user.type(
      screen.getByLabelText("Your message"),
      "  good luck  {Enter}",
    );
    expect(connector.room.sentOfType("chat")).toEqual([{ text: "good luck" }]);
    expect(screen.getByLabelText("Your message")).toHaveValue("");
    expect(screen.getByLabelText("Your message")).toHaveFocus();
  });

  it("limits how much you can type", async () => {
    const { user, bar } = await seated();
    await user.click(bar());
    expect(screen.getByLabelText("Your message")).toHaveAttribute(
      "maxlength",
      "200",
    );
  });

  it("shows new messages while open", async () => {
    const { say, user, bar } = await seated();
    await user.click(bar());
    say(said(1, "live one"));
    expect(within(screen.getByRole("log")).getByText("live one")).toBeVisible();
  });

  it("warns when messages are sent too fast", async () => {
    const { connector, user, bar } = await seated();
    await user.click(bar());
    act(() => connector.room.emit("error", { code: "CHAT_TOO_FAST" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/too fast/i);
    await user.type(screen.getByLabelText("Your message"), "ok{Enter}");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("closes with Escape or the X and puts you back on the bar", async () => {
    const { user, bar } = await seated();
    await user.click(bar());
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("log")).toBeNull();
    expect(bar()).toHaveFocus();

    await user.click(bar());
    await user.click(screen.getByRole("button", { name: "Close chat" }));
    expect(screen.queryByRole("log")).toBeNull();
  });

  it("stays open, with what you typed, when the game starts", async () => {
    const { connector, user, bar } = await seated();
    await user.click(bar());
    await user.type(screen.getByLabelText("Your message"), "one sec");
    act(() =>
      connector.room.emit(
        "lobby",
        lobby([player("host", "Ann", "visor"), player("me", "Ben", "teal")], {
          hostId: "host",
          started: true,
        }),
      ),
    );
    expect(screen.getByLabelText("Your message")).toHaveValue("one sec");
  });
});
