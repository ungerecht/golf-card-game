import { useEffect, useId, useRef, type FormEvent } from "react";
import { CHAT_MESSAGE_MAX_LENGTH, type ChatMessage } from "@golf/shared";
import { useLobby } from "../../store/useLobby";

/**
 * Room chat. Closed, it is one line showing the latest message. Opened, it
 * is a box at the top of the screen with the recent messages and a place to
 * type. The box sits over the page, so opening it never moves anything.
 */
export function Chat() {
  const messages = useLobby((s) => s.chat);
  const myId = useLobby((s) => s.myId);
  const tooFast = useLobby((s) => s.chatTooFast);
  const sendChat = useLobby((s) => s.sendChat);
  const open = useLobby((s) => s.chatOpen);
  const draft = useLobby((s) => s.chatDraft);
  const read = useLobby((s) => s.chatRead);
  const setOpen = useLobby((s) => s.setChatOpen);
  const setDraft = useLobby((s) => s.setChatDraft);

  const panelId = useId();
  const input = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLOListElement>(null);
  const opener = useRef<HTMLButtonElement>(null);

  const latest = messages.at(-1);
  const newest = latest?.id ?? 0;
  const unread = open
    ? 0
    : messages.filter((m) => m.id > read && m.playerId !== myId).length;

  // Show the newest message, and put the cursor where typing starts.
  useEffect(() => {
    if (open && log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [open, newest]);
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  const close = () => {
    setOpen(false);
    opener.current?.focus();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (text === "") return;
    sendChat(text);
  };

  return (
    <div className="chat">
      <button
        ref={opener}
        type="button"
        className="chat-bar"
        aria-expanded={open}
        aria-controls={panelId}
        // Hidden, not removed, while the box is over it, so nothing shifts.
        style={open ? { visibility: "hidden" } : undefined}
        onClick={() => setOpen(true)}
      >
        <span className="sr-only">Open chat. Latest message: </span>
        <span className="chat-latest" aria-live="polite">
          {latest === undefined ? (
            <span className="chat-empty">No messages yet. Tap to chat.</span>
          ) : (
            <Line message={latest} />
          )}
        </span>
        {unread > 0 && (
          <span className="chat-unread">
            {unread}
            <span className="sr-only"> unread</span>
          </span>
        )}
      </button>

      {open && (
        <section
          id={panelId}
          className="panel chat-panel"
          aria-label="Chat"
          onKeyDown={(event) => {
            if (event.key === "Escape") close();
          }}
        >
          <button
            type="button"
            className="close"
            aria-label="Close chat"
            onClick={close}
          >
            <span aria-hidden="true">X</span>
          </button>
          <ol
            ref={log}
            className="chat-log"
            role="log"
            aria-label="Chat history"
            aria-live="polite"
          >
            {messages.length === 0 && (
              <li className="chat-empty">No messages yet.</li>
            )}
            {messages.map((m) => (
              <li
                key={m.id}
                className={m.playerId === myId ? "chat-line mine" : "chat-line"}
              >
                <Line message={m} />
              </li>
            ))}
          </ol>
          {tooFast && (
            <p className="chat-warning" role="alert">
              You are sending messages too fast. Wait a moment.
            </p>
          )}
          <form className="chat-form" onSubmit={submit}>
            <input
              ref={input}
              aria-label="Your message"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={CHAT_MESSAGE_MAX_LENGTH}
              autoComplete="off"
              enterKeyHint="send"
              placeholder="Say something"
            />
            <button
              type="submit"
              className="button primary"
              disabled={draft.trim() === ""}
            >
              Send
            </button>
          </form>
        </section>
      )}
    </div>
  );
}

function Line({ message }: { message: ChatMessage }) {
  return (
    <>
      <strong className="chat-name">{message.name}:</strong>{" "}
      <span className="chat-text">{message.text}</span>
    </>
  );
}
