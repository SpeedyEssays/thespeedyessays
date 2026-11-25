import { useState, type FormEvent } from "react";

import { StaffAvatar } from "@/components/staff-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  removeStaffAvatar,
  uploadStaffAvatar,
} from "@/lib/staff-avatar.functions";

const supportedTypes = ["image/jpeg", "image/png", "image/webp"];
const maxPhotoSize = 10 * 1024 * 1024;

async function preparePhoto(file: File) {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  try {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Couldn’t prepare the photo.");
    const size = Math.min(bitmap.width, bitmap.height);
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(
      bitmap,
      (bitmap.width - size) / 2,
      (bitmap.height - size) / 2,
      size,
      size,
      0,
      0,
      canvas.width,
      canvas.height,
    );
  } finally {
    bitmap.close();
  }
  const jpeg = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.88),
  );
  if (!jpeg) throw new Error("Couldn’t prepare the photo.");
  return jpeg;
}

export function StaffProfile({
  avatarId: initialAvatar,
  supportName,
}: {
  avatarId: string | null;
  supportName: string | null;
}) {
  const [avatarId, setAvatarId] = useState(initialAvatar);
  const [file, setFile] = useState<File | null>(null);
  const [action, setAction] = useState<"upload" | "remove" | null>(null);
  const [notice, setNotice] = useState("");
  const [problem, setProblem] = useState("");

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || action) return;
    const form = event.currentTarget;
    setAction("upload");
    setNotice("");
    setProblem("");
    try {
      const data = new FormData();
      data.set("avatar", await preparePhoto(file), "avatar.jpg");
      setAvatarId(await uploadStaffAvatar({ data }));
      form.reset();
      setFile(null);
      setNotice("Profile photo saved.");
    } catch {
      setProblem(
        "Couldn’t save this photo. Try another JPG, PNG or WebP image.",
      );
    } finally {
      setAction(null);
    }
  }

  async function remove() {
    if (action) return;
    setAction("remove");
    setNotice("");
    setProblem("");
    try {
      await removeStaffAvatar();
      setAvatarId(null);
      setNotice("Profile photo removed.");
    } catch {
      setProblem("Couldn’t remove the photo. Try again.");
    } finally {
      setAction(null);
    }
  }

  return (
    <section
      aria-labelledby="staff-profile"
      className="max-w-xl space-y-5 rounded-2xl border bg-card p-6"
    >
      <h2 id="staff-profile" className="text-2xl font-semibold">
        My profile
      </h2>
      <div className="flex items-center gap-4">
        <StaffAvatar
          avatarId={avatarId}
          name={supportName}
          className="size-16 text-lg"
        />
        <div>
          <p className="font-medium">
            {supportName ? `${supportName} Support` : "Support"}
          </p>
          <p className="text-sm text-muted-foreground">
            Customers see your photo next to your support messages.
          </p>
        </div>
      </div>
      <form className="space-y-3" onSubmit={(event) => void upload(event)}>
        <div className="space-y-2">
          <Label htmlFor="staff-photo">Profile photo</Label>
          <Input
            id="staff-photo"
            type="file"
            accept={supportedTypes.join(",")}
            aria-describedby="staff-photo-formats"
            disabled={action !== null}
            onChange={(event) => {
              const selected = event.currentTarget.files?.[0];
              setNotice("");
              if (
                selected &&
                (!supportedTypes.includes(selected.type) ||
                  selected.size > maxPhotoSize)
              ) {
                event.currentTarget.value = "";
                setFile(null);
                setProblem("Choose a JPG, PNG or WebP photo up to 10 MB.");
                return;
              }
              setProblem("");
              setFile(selected ?? null);
            }}
          />
          <p id="staff-photo-formats" className="text-xs text-muted-foreground">
            JPG, PNG or WebP. Up to 10 MB.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={!file || action !== null}>
            {action === "upload" ? "Uploading…" : "Upload photo"}
          </Button>
          {avatarId && (
            <Button
              type="button"
              variant="outline"
              disabled={action !== null}
              onClick={() => void remove()}
            >
              {action === "remove" ? "Removing…" : "Remove photo"}
            </Button>
          )}
        </div>
      </form>
      {notice && (
        <p role="status" className="text-sm text-success">
          {notice}
        </p>
      )}
      {problem && (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      )}
    </section>
  );
}
