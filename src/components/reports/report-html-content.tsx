"use client";

// Content is sanitized with DOMPurify before rendering.
// The HTML source is our own Claude API output (trusted), but we
// sanitize as defense-in-depth. DOMPurify is the industry-standard
// HTML sanitizer recommended by OWASP.
//
// `isomorphic-dompurify` wraps the browser DOMPurify on the client and a
// JSDOM-backed instance on the server, so this component renders correctly
// during SSR (Next still SSRs `use client` components for the initial HTML).
import DOMPurify from "isomorphic-dompurify";

export function ReportHtmlContent({ html }: { html: string }) {
  const sanitized = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ["h1", "h2", "h3", "h4", "p", "ul", "ol", "li", "strong", "em", "br", "span", "a"],
    ALLOWED_ATTR: ["href", "class"],
  });

  // Using dangerouslySetInnerHTML with DOMPurify-sanitized content is safe
  // per OWASP guidelines. The content is restricted to formatting tags only.
  return <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: sanitized }} />;
}
