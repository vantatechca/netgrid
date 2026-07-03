import { z } from "zod";

const clientFields = z.object({
  name: z
    .string()
    .min(1, "Client name is required")
    .max(255, "Name must be 255 characters or less"),
  contactName: z
    .string()
    .max(255, "Contact name must be 255 characters or less")
    .optional()
    .or(z.literal("")),
  contactEmail: z
    .string()
    .email("Invalid email address")
    .max(255)
    .optional()
    .or(z.literal("")),
  contactPhone: z
    .string()
    .max(50, "Phone must be 50 characters or less")
    .optional()
    .or(z.literal("")),
  niche: z
    .string()
    .max(255, "Niche must be 255 characters or less")
    .optional()
    .or(z.literal("")),
  totalBlogsTarget: z.coerce
    .number()
    .int("Must be a whole number")
    .min(0, "Must be 0 or more")
    .optional(),
  notesInternal: z.string().optional().or(z.literal("")),
  // Optional client-level custom generation prompt. When set, all this
  // client's blogs are generated from it instead of the niche/persona style
  // (a per-blog customPrompt overrides it). Compliance + JSON output stay locked.
  customPrompt: z.string().optional().or(z.literal("")),
  status: z.enum(["onboarding", "active", "paused", "churned"]).optional(),
  // Call-to-action button appended to the bottom of every published post for
  // this client (e.g. a link to their main website / contact / registration).
  ctaEnabled: z.boolean().optional(),
  ctaLabel: z
    .string()
    .max(80, "Button text must be 80 characters or less")
    .optional()
    .or(z.literal("")),
  ctaUrl: z
    .string()
    .url("Enter a valid URL (https://…)")
    .max(1000)
    .optional()
    .or(z.literal("")),
  ctaPlacement: z
    .enum(["bottom", "top_bottom", "top_middle_bottom"])
    .optional(),
});

// When the action button is enabled, both the label and URL are required.
const ctaComplete = (d: {
  ctaEnabled?: boolean;
  ctaLabel?: string;
  ctaUrl?: string;
}) =>
  !d.ctaEnabled ||
  ((d.ctaLabel ?? "").trim() !== "" && (d.ctaUrl ?? "").trim() !== "");

const ctaRefineOpts = {
  message: "Button text and URL are required when the action button is enabled",
  path: ["ctaUrl"] as string[],
};

export const createClientSchema = clientFields.refine(ctaComplete, ctaRefineOpts);

export type CreateClientInput = z.infer<typeof createClientSchema>;

export const updateClientSchema = clientFields.partial().refine(ctaComplete, ctaRefineOpts);

export type UpdateClientInput = z.infer<typeof updateClientSchema>;
