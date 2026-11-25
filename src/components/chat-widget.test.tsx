import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { getOnlineSupport } from "@/lib/staff-presence.functions";
import { ChatWidget } from "./chat-widget";

vi.mock("@/lib/staff-presence.functions", () => ({
  getOnlineSupport: vi.fn(),
}));

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.restoreAllMocks();
});

it("shows the available staff member and offers playback when autoplay is blocked", async () => {
  vi.mocked(getOnlineSupport).mockResolvedValue({ name: "Phoebe" });
  const play = vi
    .spyOn(HTMLMediaElement.prototype, "play")
    .mockRejectedValueOnce(
      new DOMException("User interaction required", "NotAllowedError"),
    )
    .mockResolvedValue(undefined);

  const { container } = render(<ChatWidget />);
  expect(container.querySelector("audio")).toHaveAttribute(
    "src",
    "/chat-pop.mp3",
  );

  expect(
    await screen.findByText("Phoebe is online", {}, { timeout: 3000 }),
  ).toBeVisible();
  expect(screen.getByText(/Looking for a better price/)).toBeVisible();
  expect(play).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Play chat alert" }));
  await waitFor(() =>
    expect(sessionStorage.getItem("se-chat-pop-played")).toBe("1"),
  );
  expect(play).toHaveBeenCalledTimes(2);
});
