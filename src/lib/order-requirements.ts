export const orderLanguages = {
  "en-US": "English (US)",
  "en-GB": "English (UK)",
  "en-CA": "English (Canada)",
  "en-AU": "English (Australia)",
} as const;

export type OrderLanguage = keyof typeof orderLanguages;
export const orderLanguageIds = Object.keys(orderLanguages) as OrderLanguage[];

export const orderSoftware = {
  autocad: "AutoCAD",
  matlab: "MATLAB",
  spss: "SPSS",
  access: "Microsoft Access",
  stata: "Stata",
  database: "Database",
  programming: "Programming language",
  javascript: "JavaScript",
  "html-css": "HTML/CSS",
  rstudio: "RStudio",
  python: "Python",
  "packet-tracer": "Cisco Packet Tracer",
  jasp: "JASP",
  jamovi: "jamovi",
  sql: "MySQL / SQL",
  excel: "Microsoft Excel",
  "power-bi": "Power BI",
  tableau: "Tableau",
  other: "Other (specify the software)",
  any: "Writer's choice (any)",
} as const;

export type OrderSoftware = keyof typeof orderSoftware;
export const orderSoftwareIds = Object.keys(orderSoftware) as OrderSoftware[];
export const MAX_SOFTWARE_DETAILS = 250;

// An empty selection means Yes was chosen, but a tool has not been selected.
export type SoftwareSelection = OrderSoftware | "none" | "";

export function selectedSoftware(
  selection: SoftwareSelection,
): OrderSoftware | null {
  return selection === "none" || selection === "" ? null : selection;
}

export function softwareSelectionError(
  selection: SoftwareSelection,
  details?: string,
) {
  if (selection === "") return "Choose the software needed for this order.";
  if (selection === "other" && details !== undefined && !details.trim())
    return "Enter the software you need.";
}
