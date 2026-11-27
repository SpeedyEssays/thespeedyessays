import { useId, useRef, useState, type FormEvent } from "react";
import { useRouter } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  canRenderFilePreview,
  prepareDeliveryPreview,
} from "@/lib/delivery-preview";
import { addOrderFilePreview, uploadOrderFile } from "@/lib/files.functions";
import {
  checkOrderFile,
  fileKindLabels,
  fileRequiresApproval,
  MAX_ORDER_FILES_PER_UPLOAD,
  orderFileAccept,
  staffFileKinds,
  type FileKind,
  type OrderFileView,
} from "@/lib/orders";

type Upload = { file: File; id: string; pdf?: File; preview?: File };

export function OrderFileUpload({
  code,
  staff,
}: {
  code: string;
  staff: boolean;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<FileKind | "">(staff ? "" : "brief");
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [notice, setNotice] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const needsPreview = fileRequiresApproval(kind);
  const missingPdf =
    needsPreview &&
    uploads.some(({ file, pdf }) => !pdf && !canRenderFilePreview(file.name));

  function selectFiles(files: File[]) {
    setNotice("");
    setProblem("");
    if (
      files.length > MAX_ORDER_FILES_PER_UPLOAD ||
      files.some(
        (file) =>
          !checkOrderFile(file) ||
          (kind === "speaker-notes" && !/\.docx$/i.test(file.name)),
      )
    ) {
      setProblem(
        kind === "speaker-notes"
          ? "Choose up to eight Word (.docx) files, each no larger than 4 MB."
          : "Choose up to eight supported files, each no larger than 4 MB.",
      );
      setUploads([]);
      if (fileInput.current) fileInput.current.value = "";
      return;
    }
    setUploads(files.map((file) => ({ file, id: crypto.randomUUID() })));
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !kind || !uploads.length || missingPdf) return;
    if (
      kind === "speaker-notes" &&
      uploads.some(({ file }) => !/\.docx$/i.test(file.name))
    ) {
      setProblem("Upload speaker notes as Word (.docx) files.");
      return;
    }
    setBusy(true);
    setProblem("");
    setNotice("");
    try {
      const failed: Upload[] = [];
      const errors: string[] = [];
      for (const item of uploads) {
        let attempt = item;
        try {
          const data = new FormData();
          data.set("code", code);
          data.set("kind", kind);
          data.set("file", item.file);
          data.set("uploadId", item.id);
          if (needsPreview) {
            const preview =
              item.preview ??
              (await prepareDeliveryPreview(item.pdf ?? item.file, code));
            attempt = { ...item, preview };
            data.set("preview", preview);
          }
          await uploadOrderFile({ data });
        } catch (error) {
          failed.push(attempt);
          errors.push(
            `${item.file.name} — ${error instanceof Error ? error.message : "Upload failed. Try again."}`,
          );
        }
      }
      setUploads(failed);
      if (fileInput.current) fileInput.current.value = "";
      if (errors.length) setProblem(errors.join("\n"));
      if (failed.length < uploads.length) {
        setNotice(
          needsPreview
            ? "Files prepared. Mark the order delivered to share the previews."
            : "Files uploaded.",
        );
        await router.invalidate();
      }
    } catch {
      setProblem("Refresh the order to check which files were saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-3" onSubmit={(event) => void upload(event)}>
      {staff && (
        <div className="space-y-2">
          <Label htmlFor="order-file-type">Delivery type</Label>
          <select
            id="order-file-type"
            className="block w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={kind}
            disabled={busy}
            required
            onChange={(event) => {
              setKind(event.target.value as FileKind | "");
              setNotice("");
              setProblem("");
            }}
          >
            <option value="" disabled>
              Choose a delivery type
            </option>
            {staffFileKinds.map((type) => (
              <option key={type} value={type}>
                {fileKindLabels[type]}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="order-upload">
          {staff ? "Choose files for this customer" : "Choose supporting files"}
        </Label>
        <Input
          ref={fileInput}
          id="order-upload"
          type="file"
          accept={kind === "speaker-notes" ? ".docx" : orderFileAccept}
          multiple
          disabled={busy || !kind}
          onChange={(event) =>
            selectFiles(Array.from(event.target.files ?? []))
          }
        />
        <p className="text-xs text-muted-foreground">
          Up to eight files at a time, 4 MB each.
        </p>
        {needsPreview && (
          <p className="text-xs text-muted-foreground">
            PDFs and supported images get a watermarked preview automatically.
            For Word, slides or other formats, also choose a PDF export.
          </p>
        )}
      </div>
      {uploads.length > 0 && (
        <ul className="space-y-2">
          {uploads.map(({ file, id, pdf }) => (
            <li
              className="space-y-2 rounded-md border bg-card p-3 text-sm"
              key={id}
            >
              <p className="break-words font-medium">{file.name}</p>
              {needsPreview && (
                <div className="space-y-2">
                  <Label htmlFor={`preview-source-${id}`}>
                    {canRenderFilePreview(file.name)
                      ? "Alternate preview PDF (optional)"
                      : "Preview PDF"}{" "}
                    for {file.name}
                  </Label>
                  <Input
                    id={`preview-source-${id}`}
                    type="file"
                    accept=".pdf,application/pdf"
                    disabled={busy}
                    onChange={(event) => {
                      const source = event.target.files?.[0];
                      if (source && !/\.pdf$/i.test(source.name)) {
                        setProblem("Choose a PDF export for the preview.");
                        event.target.value = "";
                        return;
                      }
                      setProblem("");
                      setUploads((items) =>
                        items.map((item) =>
                          item.id === id
                            ? {
                                file,
                                id: item.preview ? crypto.randomUUID() : id,
                                pdf: source,
                              }
                            : item,
                        ),
                      );
                    }}
                  />
                  {pdf && (
                    <p className="break-words text-xs text-muted-foreground">
                      Selected {pdf.name}
                    </p>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <Button
        variant="outline"
        size="sm"
        type="submit"
        disabled={busy || !kind || !uploads.length || missingPdf}
      >
        {busy
          ? needsPreview
            ? "Preparing previews…"
            : "Uploading…"
          : "Upload files"}
      </Button>
      {problem && (
        <p
          role="alert"
          className="break-words whitespace-pre-line text-sm text-destructive"
        >
          {problem}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
    </form>
  );
}

export function AddFilePreview({
  file,
  code,
}: {
  file: OrderFileView;
  code: string;
}) {
  const inputId = useId();
  const router = useRouter();
  const automatic = canRenderFilePreview(file.name);
  const [source, setSource] = useState<File>();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || (!source && !automatic)) return;
    setBusy(true);
    setProblem("");
    try {
      let previewSource = source;
      if (!previewSource) {
        const response = await fetch(`/api/files/${file.id}`);
        if (!response.ok)
          throw new Error("The original file could not be opened.");
        previewSource = new File([await response.blob()], file.name);
      }
      const preview = await prepareDeliveryPreview(previewSource, code);
      const data = new FormData();
      data.set("fileId", String(file.id));
      data.set("preview", preview);
      await addOrderFilePreview({ data });
      await router.invalidate();
    } catch (error) {
      setProblem(
        error instanceof Error
          ? error.message
          : "The preview could not be saved. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="border-t pt-2">
      <summary className="cursor-pointer text-sm font-medium">
        Add preview
      </summary>
      <form className="mt-2 space-y-2" onSubmit={(event) => void save(event)}>
        <Label htmlFor={inputId}>
          {automatic
            ? "Alternate preview PDF (optional)"
            : "Preview PDF export"}
        </Label>
        <Input
          id={inputId}
          type="file"
          accept=".pdf,application/pdf"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file && !/\.pdf$/i.test(file.name)) {
              setProblem("Choose a PDF export for the preview.");
              event.target.value = "";
              setSource(undefined);
              return;
            }
            setProblem("");
            setSource(file);
          }}
        />
        {automatic && (
          <p className="text-xs text-muted-foreground">
            Leave this blank to create the preview from the original file.
          </p>
        )}
        <Button
          type="submit"
          size="sm"
          variant="outline"
          disabled={busy || (!automatic && !source)}
        >
          {busy ? "Preparing preview…" : "Create preview"}
        </Button>
        {problem && (
          <p role="alert" className="text-sm text-destructive">
            {problem}
          </p>
        )}
      </form>
    </details>
  );
}
