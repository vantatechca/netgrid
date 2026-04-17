import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { generateMagicToken } from "@/lib/auth/helpers";
import { sendMagicLink } from "@/lib/services/email";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    // Find user with matching email and client role
    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.email, email.toLowerCase().trim()), eq(users.role, "client")))
      .limit(1);

    if (!user) {
      return NextResponse.json(
        { error: "No client account found with this email" },
        { status: 404 }
      );
    }

    // Generate magic token
    const token = generateMagicToken(user.id);

    // Send magic link email
    await sendMagicLink(user.email, token);

    return NextResponse.json(
      { message: "Magic link sent successfully" },
      { status: 200 }
    );
  } catch (error) {
    console.error("Magic link error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
