"use client";

import DOMPurify from "isomorphic-dompurify";

/**
 * Renders a generated blog post's HTML body the way it would appear once
 * published. Sanitized with DOMPurify and styled with descendant-selector
 * utilities (the project doesn't ship the Tailwind typography plugin, so
 * `prose` classes are no-ops here — we apply article styling directly).
 *
 * Image tags are allowed because content-generator may embed a mid-article
 * body image as a data: URI from Nano Banana. The source is admin-authored
 * Claude output; sanitization is defense-in-depth.
 */
export function ArticlePreviewHtml({ html }: { html: string }) {
  const sanitized = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "h1",
      "h2",
      "h3",
      "h4",
      "p",
      "ul",
      "ol",
      "li",
      "strong",
      "em",
      "br",
      "span",
      "a",
      "img",
      "figure",
      "figcaption",
      "blockquote",
    ],
    ALLOWED_ATTR: [
      "href",
      "class",
      "src",
      "alt",
      "title",
      "loading",
      "width",
      "height",
    ],
  });

  return (
    <article
      className={[
        "max-w-none text-base leading-7 text-foreground",
        "[&_h1]:mt-8 [&_h1]:mb-4 [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:leading-tight",
        "[&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:leading-tight [&_h2]:tracking-tight",
        "[&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-xl [&_h3]:font-semibold",
        "[&_h4]:mt-4 [&_h4]:mb-2 [&_h4]:text-lg [&_h4]:font-semibold",
        "[&_p]:my-4",
        "[&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-2",
        "[&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:space-y-2",
        "[&_li]:leading-7",
        "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2",
        "[&_strong]:font-semibold",
        "[&_em]:italic",
        "[&_img]:my-6 [&_img]:rounded-md [&_img]:border [&_img]:max-w-full [&_img]:h-auto",
        "[&_figure]:my-6",
        "[&_figcaption]:mt-2 [&_figcaption]:text-center [&_figcaption]:text-sm [&_figcaption]:text-muted-foreground",
        "[&_blockquote]:my-4 [&_blockquote]:border-l-4 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground",
        "[&>*:first-child]:mt-0",
      ].join(" ")}
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}
