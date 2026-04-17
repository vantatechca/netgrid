import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { blogs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { testConnection } from "@/lib/services/wp-client";

export async function POST(
  request: NextRequest,
  { params }: { params: { blogId: string } }
) {
  // Auth check
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = (session.user as { role?: string }).role;
  if (role !== "super_admin" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { blogId } = params;

  // Fetch blog credentials
  const [blog] = await db
    .select({
      id: blogs.id,
      wpUrl: blogs.wpUrl,
      wpUsername: blogs.wpUsername,
      wpAppPassword: blogs.wpAppPassword,
    })
    .from(blogs)
    .where(eq(blogs.id, blogId));

  if (!blog) {
    return NextResponse.json({ error: "Blog not found" }, { status: 404 });
  }

  if (!blog.wpUrl || !blog.wpUsername || !blog.wpAppPassword) {
    return NextResponse.json(
      {
        success: false,
        message: "WordPress credentials are incomplete. Set WP URL, username, and application password.",
      },
      { status: 400 }
    );
  }

  // Test connection
  const result = await testConnection(blog.wpUrl, blog.wpUsername, blog.wpAppPassword);

  // Update blog record with detected info on success
  if (result.success && result.seoPlugin) {
    await db
      .update(blogs)
      .set({
        seoPlugin: result.seoPlugin,
        updatedAt: new Date(),
      })
      .where(eq(blogs.id, blogId));
  }

  return NextResponse.json(result);
}
