import { z } from "zod";

const domainRegex = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

export const createBlogSchema = z.object({
  clientId: z.string().uuid("Invalid client ID"),
  domain: z
    .string()
    .min(1, "Domain is required")
    .regex(domainRegex, "Invalid domain format (e.g. example.com)"),
  wpUrl: z
    .string()
    .url("Must be a valid URL")
    .optional()
    .or(z.literal("")),
  wpUsername: z.string().optional().or(z.literal("")),
  wpAppPassword: z.string().optional().or(z.literal("")),
  seoPlugin: z.enum(["yoast", "rankmath", "none"]).optional().default("none"),
  hostingProvider: z.string().optional().or(z.literal("")),
  hostingLoginUrl: z
    .string()
    .url("Must be a valid URL")
    .optional()
    .or(z.literal("")),
  hostingUsername: z.string().optional().or(z.literal("")),
  hostingPassword: z.string().optional().or(z.literal("")),
  registrar: z.string().optional().or(z.literal("")),
  registrarLoginUrl: z
    .string()
    .url("Must be a valid URL")
    .optional()
    .or(z.literal("")),
  registrarUsername: z.string().optional().or(z.literal("")),
  registrarPassword: z.string().optional().or(z.literal("")),
  domainExpiryDate: z.string().optional().or(z.literal("")),
  hostingExpiryDate: z.string().optional().or(z.literal("")),
  sslExpiryDate: z.string().optional().or(z.literal("")),
  postingFrequency: z.string().optional().or(z.literal("")),
  postingFrequencyDays: z.coerce.number().int().positive().optional().or(z.literal("").transform(() => undefined)),
  status: z.enum(["active", "paused", "setup", "decommissioned"]).optional().default("setup"),
  notesInternal: z.string().optional().or(z.literal("")),
});

export const updateBlogSchema = createBlogSchema.partial().omit({ clientId: true });

export type CreateBlogInput = z.infer<typeof createBlogSchema>;
export type UpdateBlogInput = z.infer<typeof updateBlogSchema>;
