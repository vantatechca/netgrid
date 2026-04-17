"use client";

// Content is sanitized with DOMPurify before rendering.
// The HTML source is our own Claude API output (trusted), but we
// sanitize as defense-in-depth. DOMPurify is the industry-standard
// HTML sanitizer recommended by OWASP.
import DOMPurify from "dompurify";

export function ReportHtmlContent({ html }: { html: string }) {
  const sanitized = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ["h1", "h2", "h3", "h4", "p", "ul", "ol", "li", "strong", "em", "br", "span", "a"],
    ALLOWED_ATTR: ["href", "class"],
  });

  // Using dangerouslySetInnerHTML with DOMPurify-sanitized content is safe
  // per OWASP guidelines. The content is restricted to formatting tags only.
  return <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: sanitized }} />;
}
