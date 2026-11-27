import { PDFDocument } from "pdf-lib";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

import { MAX_FILE_BYTES } from "./orders";

GlobalWorkerOptions.workerSrc = workerUrl;

type PageSize = { width: number; height: number };
type RenderPage = (
  canvas: HTMLCanvasElement,
  number: number,
  maxEdge: number,
) => Promise<PageSize>;

function sizeCanvas(
  canvas: HTMLCanvasElement,
  page: PageSize,
  maxEdge: number,
) {
  const scale = Math.min(maxEdge / Math.max(page.width, page.height), 3);
  canvas.width = Math.max(1, Math.ceil(page.width * scale));
  canvas.height = Math.max(1, Math.ceil(page.height * scale));
  return scale;
}

function watermark(canvas: HTMLCanvasElement, orderCode: string) {
  const context = canvas.getContext("2d")!;
  const { width, height } = canvas;
  const fontSize = Math.max(8, Math.floor(Math.min(width, height) * 0.07));
  context.save();
  context.translate(width / 2, height / 2);
  context.rotate(-Math.PI / 6);
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "rgba(25, 55, 90, 0.31)";
  context.font = `bold ${fontSize}px Arial, sans-serif`;
  for (const position of [-0.29, 0, 0.29]) {
    context.fillText(
      "SPEEDYESSAYS PREVIEW",
      0,
      Math.min(width, height) * position,
      width * 0.88,
    );
  }
  context.restore();

  context.save();
  context.textAlign = "right";
  context.fillStyle = "rgba(25, 55, 90, 0.67)";
  context.font = `bold ${Math.max(8, Math.round(fontSize * 0.27))}px Arial, sans-serif`;
  context.fillText(
    `PREVIEW · ${orderCode}`,
    width - 12,
    height - 12,
    width - 24,
  );
  context.restore();
}

function pageImage(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Could not render a preview page."));
      },
      "image/jpeg",
      quality,
    );
  });
}

async function renderImagePdf(
  canvas: HTMLCanvasElement,
  count: number,
  renderPage: RenderPage,
  orderCode: string,
) {
  for (const { edge, quality } of [
    { edge: count > 60 ? 1200 : 1500, quality: 0.73 },
    { edge: 1050, quality: 0.57 },
    { edge: 850, quality: 0.44 },
  ]) {
    const pdf = await PDFDocument.create();
    pdf.setTitle(`SpeedyEssays preview ${orderCode}`);
    let imageBytes = 0;
    for (let number = 1; number <= count; number++) {
      const { width, height } = await renderPage(canvas, number, edge);
      watermark(canvas, orderCode);
      const image = await pageImage(canvas, quality);
      imageBytes += image.size;
      if (imageBytes >= MAX_FILE_BYTES) break;
      const jpg = await pdf.embedJpg(await image.arrayBuffer());
      pdf
        .addPage([width, height])
        .drawImage(jpg, { x: 0, y: 0, width, height });
    }
    if (pdf.getPageCount() !== count) continue;
    const bytes = await pdf.save();
    if (bytes.length <= MAX_FILE_BYTES)
      return new File([Uint8Array.from(bytes)], "preview.pdf", {
        type: "application/pdf",
      });
  }
  throw new Error(
    "The preview is larger than 4 MB. Export a smaller PDF or split the delivery into separate files.",
  );
}

export async function createDeliveryPreview(file: File, orderCode: string) {
  const canvas = document.createElement("canvas");
  if (/\.pdf$/i.test(file.name)) {
    const loading = getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      useSystemFonts: true,
      useWasm: false,
      stopAtErrors: true,
    });
    try {
      const pdf = await loading.promise.catch(() => {
        throw new Error(
          "The PDF could not be opened. Export an unlocked PDF and try again.",
        );
      });
      return await renderImagePdf(
        canvas,
        pdf.numPages,
        async (target, number, edge) => {
          const page = await pdf.getPage(number);
          try {
            const size = page.getViewport({ scale: 1 });
            const scale = sizeCanvas(target, size, edge);
            await page.render({
              canvas: target,
              viewport: page.getViewport({ scale }),
              background: "#ffffff",
            }).promise;
            return { width: size.width, height: size.height };
          } finally {
            page.cleanup();
          }
        },
        orderCode,
      );
    } finally {
      await loading.destroy();
      canvas.width = canvas.height = 0;
    }
  }

  const image = await createImageBitmap(file);
  try {
    return await renderImagePdf(
      canvas,
      1,
      async (target, _number, edge) => {
        sizeCanvas(target, image, edge);
        const context = target.getContext("2d")!;
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, target.width, target.height);
        context.drawImage(image, 0, 0, target.width, target.height);
        return { width: target.width, height: target.height };
      },
      orderCode,
    );
  } finally {
    image.close();
    canvas.width = canvas.height = 0;
  }
}
