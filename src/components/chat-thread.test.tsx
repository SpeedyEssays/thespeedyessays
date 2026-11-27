import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { messageBody } from "@/lib/chat-message";
import { ChatThread } from "./chat-thread";

const fileNotice = {
  id: 1,
  sender: "client",
  supportName: null,
  body: "New file uploaded\nBrief.pdf",
  at: "2026-11-21T14:05:00.000Z",
  fileUploaded: true,
};
const staffReply = {
  id: 2,
  sender: "support",
  supportName: "Marvin",
  body: "Accidental reply",
  at: "2026-11-21T14:06:00.000Z",
};

it("shows a file upload notice to both sides and removes only the staff reply", async () => {
  const load = vi.fn().mockResolvedValue([fileNotice, staffReply]);
  const removeReply = vi.fn(async () => {
    load.mockResolvedValue([fileNotice]);
  });
  const props = {
    load,
    send: vi.fn(),
    otherLabel: "Customer",
    emptyText: "No messages",
  };
  const { rerender } = render(
    <ChatThread {...props} ownSender="support" removeReply={removeReply} />,
  );
  expect(await screen.findByText("File upload")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Remove message" }));
  const dialog = await screen.findByRole("dialog", {
    name: "Remove this message?",
  });
  expect(removeReply).not.toHaveBeenCalled();
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Remove message" }),
  );
  await waitFor(() =>
    expect(screen.queryByText("Accidental reply")).not.toBeInTheDocument(),
  );
  expect(removeReply).toHaveBeenCalledExactlyOnceWith(2);
  rerender(<ChatThread {...props} ownSender="client" />);
  expect(screen.getByText("File upload")).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Remove message" }),
  ).not.toBeInTheDocument();
});

it("allows a customer chat refresh to clear the newest reply after staff removes it", async () => {
  const props = {
    send: vi.fn(),
    ownSender: "client",
    otherLabel: "Support",
    emptyText: "No messages",
  };
  const { rerender } = render(
    <ChatThread
      {...props}
      load={vi.fn().mockResolvedValue([fileNotice, staffReply])}
    />,
  );
  expect(await screen.findByText("Accidental reply")).toBeInTheDocument();
  rerender(
    <ChatThread {...props} load={vi.fn().mockResolvedValue([fileNotice])} />,
  );
  await waitFor(() =>
    expect(screen.queryByText("Accidental reply")).not.toBeInTheDocument(),
  );
});

it.each(["client", "support"])(
  "shows both message timestamps for the %s",
  async (ownSender) => {
    const rows = [
      {
        id: 1,
        sender: "client",
        supportName: null,
        body: "Customer question",
        at: "2026-11-21T14:05:00.000Z",
      },
      {
        id: 2,
        sender: "support",
        supportName: "Marvin",
        body: "Dear Customer,\n\nStaff reply",
        at: "2026-11-21T14:12:00.000Z",
      },
    ];
    render(
      <ChatThread
        load={vi.fn().mockResolvedValue(rows)}
        send={vi.fn()}
        ownSender={ownSender}
        otherLabel="Other person"
        emptyText="No messages"
      />,
    );
    const question = await screen.findByText("Customer question");
    const reply = screen.getByText("Staff reply");
    expect(question.closest("li")).toHaveClass("bg-chat-customer");
    expect(reply.closest("li")).toHaveClass("bg-chat-support");
    expect(question.closest("li")?.querySelector("time")).toHaveAttribute(
      "datetime",
      rows[0].at,
    );
    expect(reply.closest("li")?.querySelector("time")).toHaveAttribute(
      "datetime",
      rows[1].at,
    );
    expect(screen.getByText("Marvin Support:")).toBeInTheDocument();
    expect(reply.closest("li")).toHaveTextContent("Dear Customer,Staff reply");
  },
);

it("allows a multi-paragraph message longer than the old website and order chat limits", async () => {
  const send = vi.fn().mockResolvedValue(undefined);
  const message = "Detailed order instructions.\n\n".repeat(300).trim();
  expect(message.length).toBeGreaterThan(5000);
  expect(messageBody.parse(message)).toBe(message);
  render(
    <ChatThread
      load={async () => []}
      send={send}
      ownSender="client"
      otherLabel="Support"
      emptyText="No messages"
    />,
  );
  const input = screen.getByRole("textbox", { name: "Message" });
  expect(input).not.toHaveAttribute("maxlength");
  fireEvent.change(input, { target: { value: message } });
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));
  await waitFor(() => expect(send).toHaveBeenCalledExactlyOnceWith(message));
});

it.each(["agent", "support"])(
  "shows the avatar of the specific staff member in a %s chat",
  async (sender) => {
    const at = "2026-11-21T14:05:00.000Z";
    render(
      <ChatThread
        load={async () => [
          {
            id: 1,
            sender,
            supportName: "Marvin",
            supportAvatarId: "first-avatar",
            body: "First reply",
            at,
          },
          {
            id: 2,
            sender,
            supportName: "Dora",
            supportAvatarId: "second-avatar",
            body: "Second reply",
            at,
          },
          { id: 3, sender, supportName: "Scarlett", body: "Earlier reply", at },
        ]}
        send={vi.fn()}
        ownSender={sender === "agent" ? "visitor" : "client"}
        otherLabel="Support"
        emptyText="No messages"
      />,
    );
    const first = (await screen.findByText("Marvin Support:")).closest("li");
    const second = screen.getByText("Dora Support:").closest("li");
    const earlier = screen.getByText("Scarlett Support:").closest("li");
    expect(first?.querySelector("img")).toHaveAttribute(
      "src",
      "/api/staff-avatar/first-avatar",
    );
    expect(second?.querySelector("img")).toHaveAttribute(
      "src",
      "/api/staff-avatar/second-avatar",
    );
    expect(earlier?.querySelector("img")).toBeNull();
  },
);

it.each(["client", "support"])(
  "shows delivery and read receipts and marks the thread read for the %s",
  async (ownSender) => {
    const otherSender = ownSender === "client" ? "support" : "client";
    const at = "2026-11-21T14:05:00.000Z";
    const markRead = vi.fn().mockResolvedValue(undefined);
    const onRead = vi.fn();
    render(
      <ChatThread
        load={async () => [
          {
            id: 1,
            sender: ownSender,
            supportName: null,
            body: "Opened",
            at,
            readAt: at,
          },
          {
            id: 2,
            sender: ownSender,
            supportName: null,
            body: "Waiting",
            at,
            readAt: null,
          },
          {
            id: 3,
            sender: otherSender,
            supportName: null,
            body: "New reply",
            at,
            readAt: null,
          },
        ]}
        send={vi.fn()}
        markRead={markRead}
        onRead={onRead}
        ownSender={ownSender}
        otherLabel="Other person"
        emptyText="No messages"
      />,
    );
    expect(await screen.findByText("Read")).toBeInTheDocument();
    expect(screen.getByText("Delivered")).toBeInTheDocument();
    expect(screen.getAllByText("Delivered")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Mark as read" }));
    await waitFor(() => expect(onRead).toHaveBeenCalledOnce());
    expect(markRead).toHaveBeenCalledWith(3);
  },
);
