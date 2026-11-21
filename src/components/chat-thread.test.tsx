import { render, screen } from "@testing-library/react";
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
        body: "Staff reply",
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
    expect(screen.getByText("Marvin Support")).toBeInTheDocument();
  },
);
