import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ChatThread } from "./chat-thread";

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
          { id: 1, sender: ownSender, supportName: null, body: "Opened", at, readAt: at },
          { id: 2, sender: ownSender, supportName: null, body: "Waiting", at, readAt: null },
          { id: 3, sender: otherSender, supportName: null, body: "New reply", at, readAt: null },
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
