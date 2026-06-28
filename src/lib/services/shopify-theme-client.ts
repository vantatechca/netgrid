import type { AxiosInstance } from "axios";
import {
  createClient,
  formatError,
  DEFAULT_API_VERSION,
  type ShopifyCreds,
} from "./shopify-client";

/**
 * Shopify theme (Asset API) client. Separate from shopify-client.ts because it
 * needs the `read_themes` / `write_themes` scopes the content client doesn't —
 * blog publishing only needs read_content / write_content.
 *
 * The one capability this exposes today is injecting an idempotent,
 * netgrid-managed SEO block into the theme head. It surfaces the OG `article:*`
 * tags and a JSON-LD BlogPosting block that the stock Shopify meta-tags snippet
 * drops — every value maps to something the publishing flow already sends per
 * post (author, tags, publish date, featured image, SEO title/description).
 *
 * Safety properties for a network of many stores:
 *   - Targets only the PUBLISHED theme (role: "main").
 *   - Never overwrites the merchant's markup — it appends/updates a single
 *     marker-delimited block, leaving everything else byte-for-byte.
 *   - Idempotent — re-running replaces the block in place (or no-ops when the
 *     content is already current), so it's safe to run on every store, repeatedly.
 */

const THEME_TIMEOUT_MS = 20000;

/** Bump when the injected block changes so existing stores get re-patched. */
export const SEO_BLOCK_VERSION = 1;
const MARKER_BEGIN = `{%- comment -%} BEGIN netgrid-seo v${SEO_BLOCK_VERSION} — managed by netgrid; do not edit {%- endcomment -%}`;
const MARKER_END = `{%- comment -%} END netgrid-seo v${SEO_BLOCK_VERSION} {%- endcomment -%}`;
// Matches any prior version's block so an upgrade replaces it instead of
// stacking. Spans the opening `{%- comment -%}` of the BEGIN marker through the
// closing `{%- endcomment -%}` of the END marker. Note the final tag is
// `endcomment`, not `comment` — both markers are full self-closing comments.
// Non-global so `.test()` is stateless; a fresh global clone is used for
// replacement to avoid the lastIndex footgun.
const ANY_BLOCK_SRC =
  String.raw`\{%-?\s*comment\s*-?%\}\s*BEGIN netgrid-seo v\d+[\s\S]*?END netgrid-seo v\d+\s*\{%-?\s*endcomment\s*-?%\}`;
const ANY_BLOCK_TEST = new RegExp(ANY_BLOCK_SRC);
function anyBlockRe(): RegExp {
  return new RegExp(ANY_BLOCK_SRC, "g");
}

const SNIPPET_KEY = "snippets/meta-tags.liquid";
const LAYOUT_KEY = "layout/theme.liquid";

interface ShopifyTheme {
  id: number;
  name: string;
  role: string; // "main" = published, "unpublished", "demo", "development"
}

/**
 * The self-contained Liquid block we inject. Guarded so it only emits on
 * article pages and renders nothing elsewhere. Safe to live anywhere inside
 * <head> (meta-tags.liquid already runs there).
 */
export function buildSeoMetaBlock(): string {
  return `${MARKER_BEGIN}
{%- if request.page_type == 'article' and article -%}
  {%- if article.published_at -%}
    <meta property="article:published_time" content="{{ article.published_at | date: '%Y-%m-%dT%H:%M:%SZ' }}">
  {%- endif -%}
  {%- if article.updated_at -%}
    <meta property="article:modified_time" content="{{ article.updated_at | date: '%Y-%m-%dT%H:%M:%SZ' }}">
  {%- endif -%}
  {%- if article.author != blank -%}
    <meta property="article:author" content="{{ article.author | escape }}">
  {%- endif -%}
  {%- for tag in article.tags -%}
    <meta property="article:tag" content="{{ tag | escape }}">
  {%- endfor -%}
  {%- if article.image -%}
    <meta name="twitter:image" content="{{ article.image | image_url: width: 1200 | prepend: 'https:' }}">
  {%- endif -%}
  <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      "headline": {{ article.title | strip_html | truncate: 110 | json }},
      "description": {{ page_description | default: article.excerpt_or_content | strip_html | truncate: 200 | json }},
      {%- if article.image %}
        "image": {{ article.image | image_url: width: 1200 | prepend: 'https:' | json }},
      {%- endif %}
      "datePublished": {{ article.published_at | date: '%Y-%m-%dT%H:%M:%SZ' | json }},
      "dateModified": {{ article.updated_at | date: '%Y-%m-%dT%H:%M:%SZ' | json }},
      "author": { "@type": "Person", "name": {{ article.author | default: shop.name | json }} },
      "publisher": { "@type": "Organization", "name": {{ shop.name | json }} },
      "mainEntityOfPage": { "@type": "WebPage", "@id": {{ canonical_url | json }} }
    }
  </script>
{%- endif -%}
${MARKER_END}`;
}

/** Resolve the published ("main") theme for a store. */
export async function getMainTheme(
  creds: ShopifyCreds,
  apiVersion: string = DEFAULT_API_VERSION,
  client?: AxiosInstance,
): Promise<{ id: number; name: string } | null> {
  const c = client ?? (await createClient(creds, apiVersion, THEME_TIMEOUT_MS));
  const res = await c.get<{ themes: ShopifyTheme[] }>("/themes.json");
  const main = res.data.themes.find((t) => t.role === "main");
  return main ? { id: main.id, name: main.name } : null;
}

/**
 * Read a single theme asset by key. Returns its text value, or null if the
 * asset doesn't exist on this theme (e.g. a vintage theme with no
 * snippets/meta-tags.liquid).
 */
export async function getThemeAsset(
  creds: ShopifyCreds,
  themeId: number,
  key: string,
  apiVersion: string = DEFAULT_API_VERSION,
  client?: AxiosInstance,
): Promise<string | null> {
  const c = client ?? (await createClient(creds, apiVersion, THEME_TIMEOUT_MS));
  try {
    const res = await c.get<{ asset: { value?: string; key: string } }>(
      `/themes/${themeId}/assets.json`,
      { params: { "asset[key]": key } },
    );
    return res.data.asset.value ?? null;
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

/** Write (upsert) a theme asset's text value. */
export async function putThemeAsset(
  creds: ShopifyCreds,
  themeId: number,
  key: string,
  value: string,
  apiVersion: string = DEFAULT_API_VERSION,
  client?: AxiosInstance,
): Promise<void> {
  const c = client ?? (await createClient(creds, apiVersion, THEME_TIMEOUT_MS));
  await c.put(`/themes/${themeId}/assets.json`, {
    asset: { key, value },
  });
}

function isNotFound(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "response" in err &&
    (err as { response?: { status?: number } }).response?.status === 404
  );
}

/**
 * Upsert the marker-delimited block into an existing asset's source:
 *   - If a (possibly older-version) block is already present, replace it.
 *   - Otherwise append the block (it lives in <head> either way).
 * Returns null when the source already contains exactly this block — the
 * caller should then skip the write (idempotent no-op).
 */
function upsertBlock(source: string, block: string): string | null {
  if (ANY_BLOCK_TEST.test(source)) {
    const next = source.replace(anyBlockRe(), block);
    return next === source ? null : next;
  }
  const trimmed = source.replace(/\s*$/, "");
  return `${trimmed}\n\n${block}\n`;
}

/**
 * Inject the block into layout/theme.liquid right before </head> — the
 * fallback path for themes that have no snippets/meta-tags.liquid. Replaces an
 * existing block in place when present.
 */
function upsertBlockInLayout(source: string, block: string): string | null {
  if (ANY_BLOCK_TEST.test(source)) {
    const next = source.replace(anyBlockRe(), block);
    return next === source ? null : next;
  }
  const headClose = /<\/head>/i;
  if (!headClose.test(source)) return null; // no head to inject into
  return source.replace(headClose, `${block}\n</head>`);
}

export interface ThemeSeoResult {
  success: boolean;
  message: string;
  themeId?: number;
  themeName?: string;
  targetAsset?: string;
  action?: "created" | "updated" | "unchanged" | "skipped";
}

/**
 * Idempotently install the netgrid SEO block into a store's published theme.
 * Prefers snippets/meta-tags.liquid; falls back to layout/theme.liquid.
 */
export async function injectSeoMetaTags(
  creds: ShopifyCreds,
  apiVersion: string = DEFAULT_API_VERSION,
): Promise<ThemeSeoResult> {
  try {
    const client = await createClient(creds, apiVersion, THEME_TIMEOUT_MS);

    const theme = await getMainTheme(creds, apiVersion, client);
    if (!theme) {
      return { success: false, message: "No published (main) theme found for this store." };
    }

    const block = buildSeoMetaBlock();

    // Preferred target: the meta-tags snippet, which already runs in <head>.
    const snippet = await getThemeAsset(creds, theme.id, SNIPPET_KEY, apiVersion, client);
    if (snippet !== null) {
      const hadBlock = ANY_BLOCK_TEST.test(snippet);
      const next = upsertBlock(snippet, block);
      if (next === null) {
        return {
          success: true,
          message: `Theme "${theme.name}" already has the current SEO block — no change.`,
          themeId: theme.id,
          themeName: theme.name,
          targetAsset: SNIPPET_KEY,
          action: "unchanged",
        };
      }
      await putThemeAsset(creds, theme.id, SNIPPET_KEY, next, apiVersion, client);
      return {
        success: true,
        message: `SEO block ${hadBlock ? "updated" : "added"} in ${SNIPPET_KEY} on theme "${theme.name}".`,
        themeId: theme.id,
        themeName: theme.name,
        targetAsset: SNIPPET_KEY,
        action: hadBlock ? "updated" : "created",
      };
    }

    // Fallback: inject into the layout head.
    const layout = await getThemeAsset(creds, theme.id, LAYOUT_KEY, apiVersion, client);
    if (layout === null) {
      return {
        success: false,
        message: `Theme "${theme.name}" has neither ${SNIPPET_KEY} nor ${LAYOUT_KEY} — cannot inject SEO tags.`,
        themeId: theme.id,
        themeName: theme.name,
      };
    }
    const hadBlock = ANY_BLOCK_TEST.test(layout);
    const next = upsertBlockInLayout(layout, block);
    if (next === null) {
      // Either unchanged, or no </head> to anchor to.
      if (hadBlock) {
        return {
          success: true,
          message: `Theme "${theme.name}" already has the current SEO block — no change.`,
          themeId: theme.id,
          themeName: theme.name,
          targetAsset: LAYOUT_KEY,
          action: "unchanged",
        };
      }
      return {
        success: false,
        message: `Could not find </head> in ${LAYOUT_KEY} on theme "${theme.name}".`,
        themeId: theme.id,
        themeName: theme.name,
        targetAsset: LAYOUT_KEY,
        action: "skipped",
      };
    }
    await putThemeAsset(creds, theme.id, LAYOUT_KEY, next, apiVersion, client);
    return {
      success: true,
      message: `SEO block ${hadBlock ? "updated" : "added"} in ${LAYOUT_KEY} on theme "${theme.name}".`,
      themeId: theme.id,
      themeName: theme.name,
      targetAsset: LAYOUT_KEY,
      action: hadBlock ? "updated" : "created",
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}
