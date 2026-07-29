"use server";

import { revalidatePath } from "next/cache";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { clients, registrationLeads } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/helpers";

export type RegistrationLead = typeof registrationLeads.$inferSelect;

export type RegistrationPlacement = "top" | "bottom" | "top_bottom";

export interface RegistrationView {
  enabled: boolean;
  redirectUrl: string;
  placement: RegistrationPlacement;
  leadCount: number;
  recent: RegistrationLead[];
}

/** Config + recent leads for a client's registration form (Registrations tab). */
export async function getRegistrationView(clientId: string): Promise<RegistrationView> {
  await requireAdmin();
  const [client] = await db
    .select({
      enabled: clients.registrationFormEnabled,
      redirectUrl: clients.registrationRedirectUrl,
      placement: clients.registrationFormPlacement,
    })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);

  const recent = await db
    .select()
    .from(registrationLeads)
    .where(eq(registrationLeads.clientId, clientId))
    .orderBy(desc(registrationLeads.createdAt))
    .limit(100);

  return {
    enabled: client?.enabled ?? false,
    redirectUrl: client?.redirectUrl ?? "",
    placement: (client?.placement as RegistrationPlacement) ?? "bottom",
    leadCount: recent.length,
    recent,
  };
}

/** Save the registration form config (enable, redirect URL, placement). */
export async function updateRegistrationConfig(
  clientId: string,
  cfg: { enabled: boolean; redirectUrl: string; placement: RegistrationPlacement },
): Promise<{ success: boolean; message: string }> {
  await requireAdmin();

  const url = cfg.redirectUrl.trim();
  if (cfg.enabled && url && !/^https?:\/\//i.test(url)) {
    return { success: false, message: "Redirect URL must start with http:// or https://" };
  }
  const placement: RegistrationPlacement =
    cfg.placement === "top" || cfg.placement === "top_bottom" ? cfg.placement : "bottom";

  await db
    .update(clients)
    .set({
      registrationFormEnabled: cfg.enabled,
      registrationRedirectUrl: url || null,
      registrationFormPlacement: placement,
      updatedAt: new Date(),
    })
    .where(eq(clients.id, clientId));

  revalidatePath(`/clients/${clientId}`);
  return { success: true, message: "Registration form settings saved." };
}

/** Delete a captured lead. */
export async function deleteRegistrationLead(id: string): Promise<void> {
  await requireAdmin();
  const [row] = await db
    .delete(registrationLeads)
    .where(eq(registrationLeads.id, id))
    .returning({ clientId: registrationLeads.clientId });
  if (row) revalidatePath(`/clients/${row.clientId}`);
}

/** Delete several captured leads at once (multi-select batch delete). */
export async function deleteRegistrationLeads(
  ids: string[],
): Promise<{ success: boolean; deleted: number; message: string }> {
  await requireAdmin();
  if (ids.length === 0) return { success: true, deleted: 0, message: "Nothing selected." };
  const deleted = await db
    .delete(registrationLeads)
    .where(inArray(registrationLeads.id, ids))
    .returning({ clientId: registrationLeads.clientId });
  const clientId = deleted[0]?.clientId;
  if (clientId) revalidatePath(`/clients/${clientId}`);
  return {
    success: true,
    deleted: deleted.length,
    message: `Deleted ${deleted.length} lead${deleted.length === 1 ? "" : "s"}.`,
  };
}

/** One CSV cell — quote and escape per RFC 4180. */
function csvCell(v: string | null | undefined): string {
  const s = (v ?? "").toString();
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Export ALL of a client's captured leads as a CSV string. The panel turns this
 * into a file download. Includes name/location/email plus attribution.
 */
export async function exportRegistrationLeadsCsv(clientId: string): Promise<string> {
  await requireAdmin();
  const rows = await db
    .select()
    .from(registrationLeads)
    .where(eq(registrationLeads.clientId, clientId))
    .orderBy(desc(registrationLeads.createdAt));

  const header = ["created_at", "name", "location", "email", "blog_id", "post_id"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        csvCell(r.createdAt.toISOString()),
        csvCell(r.name),
        csvCell(r.location),
        csvCell(r.email),
        csvCell(r.blogId),
        csvCell(r.postId),
      ].join(","),
    );
  }
  return lines.join("\n");
}
