import { z } from "zod";

export const createClientSchema = z.object({
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
  billingType: z.enum(["one_time", "monthly", "yearly"]).optional(),
  billingAmount: z.coerce
    .number()
    .min(0, "Billing amount must be 0 or more")
    .optional(),
  setupFee: z.coerce
    .number()
    .min(0, "Setup fee must be 0 or more")
    .optional(),
  setupFeePaid: z.boolean().optional(),
  billingStartDate: z.string().optional().or(z.literal("")),
  nextBillingDate: z.string().optional().or(z.literal("")),
  billingStatus: z.enum(["active", "overdue", "paused", "cancelled"]).optional(),
  notesInternal: z.string().optional().or(z.literal("")),
  status: z.enum(["onboarding", "active", "paused", "churned"]).optional(),
});

export type CreateClientInput = z.infer<typeof createClientSchema>;

export const updateClientSchema = createClientSchema.partial();

export type UpdateClientInput = z.infer<typeof updateClientSchema>;
