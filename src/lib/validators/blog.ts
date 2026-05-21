import { z } from "zod";

const domainRegex =
  /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

// ─── Helpers ────────────────────────────────────────────────────────────────

const isValidUrl = (s: string): boolean => {
  try {
    new URL(s);
    return true;
  } catch {
    return false;
  }
};

// Optional string: pre-normalises empty strings / null / undefined to
// undefined BEFORE the inner schema runs. This avoids Zod 4's stricter
// behaviour around union+transform where "" was being rejected as
// "Invalid input" on optional fields the user left blank.
const optionalString = z.preprocess(
  (v) => {
    if (v === undefined || v === null) return undefined;
    if (typeof v !== "string") return v;
    const trimmed = v.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  },
  z.string().optional(),
);

// Optional URL: same empty-friendly pattern; non-empty values must parse
// as a URL.
const optionalUrl = z.preprocess(
  (v) => {
    if (v === undefined || v === null) return undefined;
    if (typeof v !== "string") return v;
    const trimmed = v.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  },
  z
    .string()
    .refine((s) => isValidUrl(s), { message: "Must be a valid URL" })
    .optional(),
);

// Optional positive integer: handles "", undefined, NaN, strings, numbers
const optionalNumber = z
  .union([z.string(), z.number(), z.undefined(), z.null()])
  .transform((v) => {
    if (v === undefined || v === null || v === "") return undefined;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : undefined;
  })
  .refine(
    (v) => v === undefined || (Number.isInteger(v) && v > 0),
    { message: "Must be a positive integer" },
  );

// Posting days: array of ISO weekdays (1=Mon … 7=Sun). Accepts empty/null/undefined.
// Deduplicates and sorts ascending so the DB always sees a clean array.
const postingDays = z
  .union([z.array(z.union([z.string(), z.number()])), z.undefined(), z.null()])
  .transform((v) => {
    if (!v || v.length === 0) return undefined;
    const nums = v
      .map((x: unknown) => (typeof x === "number" ? x : Number(x)))
      .filter((n: number) => Number.isInteger(n) && n >= 1 && n <= 7);
    if (nums.length === 0) return undefined;
    const uniq = Array.from(new Set<number>(nums));
    uniq.sort((a, b) => a - b);
    return uniq;
  })
  .refine(
    (v) => v === undefined || v.every((n: number) => n >= 1 && n <= 7),
    { message: "Days must be between 1 (Mon) and 7 (Sun)" },
  );

// ─── Create Schema ──────────────────────────────────────────────────────────

export const createBlogSchema = z
  .object({
    clientId: z.string().uuid("Invalid client ID"),
    domain: z
      .string()
      .min(1, "Domain is required")
      .regex(domainRegex, "Invalid domain format (e.g. example.com)"),

    platform: z.enum(["wordpress", "shopify"]).default("wordpress"),

    // WordPress fields
    wpUrl: optionalUrl,
    wpUsername: optionalString,
    wpAppPassword: optionalString,
    seoPlugin: z.enum(["yoast", "rankmath", "none"]).optional().default("none"),

    // Shopify fields — apiVersion + blogId removed (locked to defaults
    // internally; not user-configurable any more).
    shopifyAuthMode: z
      .enum(["legacy_token", "client_credentials"])
      .optional()
      .default("client_credentials"),
    shopifyStoreUrl: optionalString.refine(
      (v) =>
        v === undefined ||
        /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(v) ||
        /^https?:\/\//i.test(v),
      { message: "Use format: mystore.myshopify.com" },
    ),
    shopifyAdminApiToken: optionalString,
    shopifyClientId: optionalString,
    shopifyClientSecret: optionalString,

    // Posting cadence — frequency is always "weekly" now; days picks Mon–Sun.
    postingFrequency: optionalString,
    postingFrequencyDays: postingDays,

    status: z
      .enum(["active", "paused", "setup", "decommissioned"])
      .optional()
      .default("setup"),
    notesInternal: optionalString,
  })
  .superRefine((data, ctx) => {
    // Only enforce credentials when activating the blog AND only for the
    // selected platform. The form clears opposite-platform fields before
    // submission, but this guards against direct API callers too.
    if (data.status !== "active") return;

    if (data.platform === "wordpress") {
      if (!data.wpUrl) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["wpUrl"],
          message: "WordPress URL is required to activate",
        });
      }
      if (!data.wpAppPassword) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["wpAppPassword"],
          message: "WordPress application password is required to activate",
        });
      }
    } else if (data.platform === "shopify") {
      if (!data.shopifyStoreUrl) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["shopifyStoreUrl"],
          message: "Shopify store URL is required to activate",
        });
      }

      if (data.shopifyAuthMode === "legacy_token") {
        if (!data.shopifyAdminApiToken) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["shopifyAdminApiToken"],
            message: "Admin API token is required to activate",
          });
        }
      } else {
        if (!data.shopifyClientId) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["shopifyClientId"],
            message: "Client ID is required to activate",
          });
        }
        if (!data.shopifyClientSecret) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["shopifyClientSecret"],
            message: "Client Secret is required to activate",
          });
        }
      }
    }
  });

// ─── Update Schema ──────────────────────────────────────────────────────────

export const updateBlogSchema = z.object({
  clientId: z.string().uuid("Invalid client ID").optional(),
  domain: z
    .string()
    .min(1, "Domain is required")
    .regex(domainRegex, "Invalid domain format (e.g. example.com)")
    .optional(),
  platform: z.enum(["wordpress", "shopify"]).optional(),

  wpUrl: optionalUrl,
  wpUsername: optionalString,
  wpAppPassword: optionalString,
  seoPlugin: z.enum(["yoast", "rankmath", "none"]).optional(),

  shopifyAuthMode: z.enum(["legacy_token", "client_credentials"]).optional(),
  shopifyStoreUrl: optionalString,
  shopifyAdminApiToken: optionalString,
  shopifyClientId: optionalString,
  shopifyClientSecret: optionalString,

  postingFrequency: optionalString,
  postingFrequencyDays: postingDays,
  status: z.enum(["active", "paused", "setup", "decommissioned"]).optional(),
  notesInternal: optionalString,
});

export type CreateBlogInput = z.infer<typeof createBlogSchema>;
export type UpdateBlogInput = z.infer<typeof updateBlogSchema>;

// Silence "unused" lint warning for the optional-number helper — kept
// for upcoming numeric fields (e.g. posting cap per day).
void optionalNumber;
