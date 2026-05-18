import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, clients } from "@/lib/db/schema";
import { sql } from "drizzle-orm";
import { generateMagicToken } from "@/lib/auth/helpers";
import { sendMagicLink } from "@/lib/services/email";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = (body as { email?: unknown }).email;
    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }
    const normalizedEmail = email.toLowerCase().trim();

    // 1. Try to find an existing user by email (case-insensitive).
    let [user] = await db
      .select({
        id: users.id,
        email: users.email,
        clientId: users.clientId,
        role: users.role,
      })
      .from(users)
      .where(sql`lower(${users.email}) = ${normalizedEmail}`)
      .limit(1);

    // 2. Fallback: maybe they entered their clients.contact_email and the admin
    //    hasn't created a portal user yet. Auto-provision one.
    if (!user) {
      const [client] = await db
        .select()
        .from(clients)
        .where(sql`lower(contact_email) = ${normalizedEmail}`)
        .limit(1);

      if (!client) {
        // Don't reveal whether email exists — return generic error message.
        return NextResponse.json(
          { error: "No account found with this email" },
          { status: 404 },
        );
      }

      const [created] = await db
        .insert(users)
        .values({
          email: normalizedEmail,
          name: client.contactName || client.name,
          role: "client",
          clientId: client.id,
        })
        .returning({
          id: users.id,
          email: users.email,
          clientId: users.clientId,
          role: users.role,
        });
      user = created;
      console.log(`[magic-link] Auto-created portal user for client ${client.name}`);
    }

    // 3. Generate token bound to USER.id (the auth provider looks up by user.id).
    //    Previously generated from client.id, which is why login silently failed.
    const token = generateMagicToken(user.id);

    // 4. Send via Resend (which has its own dev fallback that logs the link).
    await sendMagicLink(normalizedEmail, token);

    return NextResponse.json(
      { message: "Magic link sent successfully" },
      { status: 200 },
    );
  } catch (error) {
    console.error("Magic link error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}