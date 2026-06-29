import { redirect } from "next/navigation";

// SEO Tracking was merged into the main SEO hub (per-client cards + fixes).
// Redirect any bookmarked /seo/tracking links to the consolidated page.
export default function SeoTrackingRedirect() {
  redirect("/seo");
}
