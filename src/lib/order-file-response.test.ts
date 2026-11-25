import { beforeEach, expect, it, vi } from "vitest";

const stubs = vi.hoisted(() => ({
  files: vi.fn(),
  user: vi.fn(),
  stream: vi.fn(),
}));
vi.mock("../../db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({ innerJoin: () => ({ where: stubs.files }) }),
    }),
  }),
}));
vi.mock("@/lib/session.server", () => ({ readSessionUser: stubs.user }));
vi.mock("@/lib/files.server", () => ({ streamOrderFile: stubs.stream }));

import { serveOrderFile } from "../routes/api.files.$id";

const delivered = new Date("2026-11-21T12:00:00Z");
const final = {
  kind: "final",
  name: "Customer work.docx",
  blobKey: "private/original",
  previewBlobKey: "private/preview",
  deliveredAt: delivered,
  releasedAt: null as Date | null,
};

function getFile(query = "") {
  return serveOrderFile(
    new Request(`https://speedyessays.invalid/api/files/42${query}`),
    "42",
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  stubs.user.mockResolvedValue({ id: "customer-1", isAdmin: false });
  stubs.files.mockResolvedValue([{ file: final, owner: "customer-1" }]);
  stubs.stream.mockImplementation(
    async (key: string) => new Response(key).body,
  );
});

it("returns only the separate preview for a delivered but unapproved final, even from the direct download URL", async () => {
  const download = await getFile("?original=1");
  expect(download.headers.get("Content-Type")).toBe("application/pdf");
  expect(download.headers.get("Content-Disposition")).toContain(
    "Customer%20work-preview.pdf",
  );
  expect(download.headers.get("Cache-Control")).toContain("no-store");
  expect(await download.text()).toBe(final.previewBlobKey);
  const preview = await getFile("?preview=1");
  expect(preview.headers.get("Content-Disposition")).toMatch(/^inline/);
  expect(await preview.text()).toBe(final.previewBlobKey);
  expect(stubs.stream).not.toHaveBeenCalledWith(final.blobKey);
});

it.each([
  { ...final, deliveredAt: null },
  { ...final, previewBlobKey: null },
])("keeps an undelivered or missing preview private", async (file) => {
  stubs.files.mockResolvedValue([{ file, owner: "customer-1" }]);
  expect((await getFile()).status).toBe(404);
  expect((await getFile("?preview=1")).status).toBe(404);
  expect(stubs.stream).not.toHaveBeenCalled();
});

it("unlocks the exact original after approval and leaves drafts and reports downloadable", async () => {
  for (const file of [
    { ...final, releasedAt: delivered },
    { ...final, kind: "paper", deliveredAt: null, previewBlobKey: null },
    { ...final, kind: "report", deliveredAt: null, previewBlobKey: null },
  ]) {
    stubs.files.mockResolvedValue([{ file, owner: "customer-1" }]);
    const response = await getFile();
    expect(response.headers.get("Content-Type")).toBe(
      "application/octet-stream",
    );
    expect(await response.text()).toBe(final.blobKey);
  }
});

it("allows authorized staff to read originals and protects both assets from a different customer", async () => {
  stubs.user.mockResolvedValue({ id: "customer-2", isAdmin: false });
  expect((await getFile("?preview=1")).status).toBe(404);
  expect((await getFile()).status).toBe(404);
  expect(stubs.stream).not.toHaveBeenCalled();
  stubs.user.mockResolvedValue({ id: "staff-1", isAdmin: true });
  expect(await (await getFile()).text()).toBe(final.blobKey);
});
