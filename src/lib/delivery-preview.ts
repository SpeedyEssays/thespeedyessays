import { createClientOnlyFn } from "@tanstack/react-start";

export function canRenderFilePreview(name: string) {
  return /\.(pdf|png|jpe?g|webp)$/i.test(name);
}

export const prepareDeliveryPreview = createClientOnlyFn(
  async (file: File, orderCode: string) => {
    const { createDeliveryPreview } = await import("./delivery-preview.client");
    return createDeliveryPreview(file, orderCode);
  },
);
