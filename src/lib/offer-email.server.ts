import { customerGreeting, withoutCustomerGreeting } from "./customer-greeting";
import type { DiscountQuote } from "./discount-codes";
import { escapeEmailHtml } from "./email-html.server";

export function renderOfferEmail(
  {
    headline,
    message,
    discount,
  }: {
    headline: string;
    message: string;
    discount: DiscountQuote | null;
  },
  origin: string,
) {
  const url = new URL("/order", origin);
  if (discount) url.searchParams.set("discount", discount.code);
  const copy = withoutCustomerGreeting(message);
  const button = discount ? "Use this discount" : "Start an order";
  const discountMarkup = discount
    ? `
<tr><td style="padding:18px;background:#f7f2e7;border:1px solid #eadbc1;border-radius:8px">
<p style="margin:0 0 6px;font-size:18px;font-weight:700;color:#172f49">${discount.percent}% off your order</p>
<p style="margin:0;font-size:15px;color:#465770">Use code <strong style="color:#172f49;letter-spacing:0.04em">${escapeEmailHtml(discount.code)}</strong></p>
</td></tr>`
    : "";

  return {
    subject: `SpeedyEssays · ${headline}`,
    text: [
      headline,
      customerGreeting,
      copy,
      discount ? `${discount.percent}% off with code ${discount.code}` : "",
      `${button} ${url.href}`,
      "SpeedyEssays Support",
    ]
      .filter(Boolean)
      .join("\n\n"),
    html: `<!doctype html><html lang="en"><body style="margin:0;background:#f7f5ef;color:#192a50;font-family:Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #e7e2d7">
<tr><td style="padding:20px 28px;background:#192a50;color:#fff;font-weight:700;font-size:18px">SpeedyEssays</td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 18px;font-size:28px;line-height:1.2">${escapeEmailHtml(headline)}</h1>
<p style="margin:0 0 12px;line-height:1.6">${customerGreeting}</p>
<p style="margin:0 0 20px;line-height:1.6;color:#334155">${escapeEmailHtml(copy).replace(/\r\n|\n|\r/g, "<br>")}</p>
${discount ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${discountMarkup}</table>` : ""}
<p style="margin:24px 0"><a href="${escapeEmailHtml(url.href)}" style="display:inline-block;padding:12px 18px;background:#192a50;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold">${button}</a></p>
<p style="margin:0;padding-top:16px;border-top:1px solid #e7e2d7;color:#475569;font-size:13px">SpeedyEssays Support</p>
</td></tr></table></td></tr></table></body></html>`,
  };
}
