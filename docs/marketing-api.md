# netgrid Marketing API (v1)

A read-only JSON API for surfacing each client's sites and SEO scores in the
marketing app's dashboard.

## Base URL

```
https://netgrid-16f6.onrender.com
```

(Use your actual deployment host.)

## Authentication

Every request needs the shared secret in **`MARKETING_API_KEY`** (set on the
netgrid server). Present it one of two ways:

```
Authorization: Bearer <MARKETING_API_KEY>
```
or
```
X-API-Key: <MARKETING_API_KEY>
```

**Server-to-server only.** The API returns client data and sets no CORS
headers, so call it from the marketing app's **backend** and keep the key
server-side — never ship it to a browser.

### Auth responses

| Status | Meaning |
|--------|---------|
| `200`  | OK |
| `401`  | Missing or wrong key |
| `503`  | `MARKETING_API_KEY` not configured on the server |

---

## Endpoints

### `GET /api/v1`

Self-documenting index — lists the available endpoints.

---

### `GET /api/v1/clients`

List clients with rolled-up stats.

**Query parameters** (all optional):

| Param    | Description |
|----------|-------------|
| `email`  | Case-insensitive exact match on the client's contact email. Use to resolve a logged-in marketing-app user to their netgrid client. |
| `status` | Filter by client status: `onboarding` \| `active` \| `paused` \| `churned`. |
| `days`   | Traffic window: count `views`/`clicks` over the last N days (`1`–`365`, clamped). Omit for all-time. |
| `since`  | Traffic window lower bound as an ISO 8601 timestamp. Ignored when `days` is set. Omit for all-time. |

**Response** `200`:

```json
{
  "clients": [
    {
      "id": "96c4f390-67f5-4687-8376-8c7c400972a2",
      "name": "Pizza Crosta",
      "niche": "restaurant",
      "status": "active",
      "blogCount": 10,
      "avgSeoScore": 98,
      "lastPostAt": "2026-07-03T15:36:00.000Z",
      "postCount": 396,
      "views": 12840,
      "clicks": 372
    }
  ]
}
```

| Field         | Type              | Notes |
|---------------|-------------------|-------|
| `id`          | string (UUID)     | netgrid client id |
| `name`        | string            | |
| `niche`       | string \| null    | |
| `status`      | string \| null    | `onboarding` \| `active` \| `paused` \| `churned` |
| `blogCount`   | number            | number of sites for this client |
| `avgSeoScore` | number \| null    | 0–100, averaged over the client's sites; `null` if none scored yet |
| `lastPostAt`  | string \| null    | ISO 8601; most recent verified post across the client's sites |
| `postCount`   | number            | published posts across the client's sites |
| `views`       | number            | tracked page views across the client's sites |
| `clicks`      | number            | tracked CTA clicks across the client's sites |

> Traffic (`views`/`clicks`) counts posts published after tracking was enabled, plus site-wide (homepage / non-article) views on Shopify stores that have the netgrid theme block installed; `0` until traffic accrues. CTR = `clicks / views`. By default the counts are all-time; pass `days` or `since` to scope them to a window (e.g. `?days=30` for the trailing 30 days).

---

### `GET /api/v1/clients/{clientId}`

A single client with its sites (blogs) and per-site SEO scores.

`clientId` must be a UUID.

**Query parameters** (all optional):

| Param   | Description |
|---------|-------------|
| `days`  | Traffic window: count `views`/`clicks` (client total and per-site) over the last N days (`1`–`365`, clamped). Omit for all-time. |
| `since` | Traffic window lower bound as an ISO 8601 timestamp. Ignored when `days` is set. Omit for all-time. |

**Response** `200`:

```json
{
  "id": "96c4f390-67f5-4687-8376-8c7c400972a2",
  "name": "Pizza Crosta",
  "niche": "restaurant",
  "status": "active",
  "contactEmail": "owner@pizzacrosta.ca",
  "blogCount": 10,
  "activeBlogCount": 10,
  "avgSeoScore": 98,
  "lastPostAt": "2026-07-03T15:36:00.000Z",
  "postCount": 396,
  "postsLast30Days": 41,
  "views": 12840,
  "clicks": 372,
  "sites": [
    {
      "id": "71fb73bd-ec69-491b-8026-0a0c3ea1d32f",
      "domain": "crostapizza.store",
      "platform": "shopify",
      "status": "active",
      "seoScore": 100,
      "lastPostAt": "2026-07-03T15:36:00.000Z",
      "lastPostTitle": "Pizzeria Crosta's Sourdough Secret",
      "lastScanAt": "2026-07-03T16:02:00.000Z",
      "postCount": 42,
      "views": 1620,
      "clicks": 48
    }
  ]
}
```

Top-level fields are the same as the list item, plus:

| Field             | Type           | Notes |
|-------------------|----------------|-------|
| `contactEmail`    | string \| null | |
| `activeBlogCount` | number         | sites with status `active` |
| `postsLast30Days` | number         | posts published in the last 30 days |
| `sites`           | array          | see below, ordered by SEO score (highest first) |

**`sites[]`:**

| Field           | Type            | Notes |
|-----------------|-----------------|-------|
| `id`            | string (UUID)   | site/blog id |
| `domain`        | string          | |
| `platform`      | string \| null  | `wordpress` \| `shopify` |
| `status`        | string \| null  | `active` \| `paused` \| `setup` \| `decommissioned` |
| `seoScore`      | number \| null  | 0–100, latest score; `null` if never scanned |
| `lastPostAt`    | string \| null  | ISO 8601, last verified post |
| `lastPostTitle` | string \| null  | |
| `lastScanAt`    | string \| null  | ISO 8601, last SEO scan |
| `postCount`     | number          | published posts on this site |
| `views`         | number          | tracked page views on this site |
| `clicks`        | number          | tracked CTA clicks on this site |

**Errors:**

| Status | When |
|--------|------|
| `400`  | `clientId` isn't a valid UUID |
| `404`  | No client with that id |

---

## Examples

### cURL

```bash
# List clients
curl -H "Authorization: Bearer $MARKETING_API_KEY" \
  https://netgrid-16f6.onrender.com/api/v1/clients

# Resolve a user to their client by email
curl -H "Authorization: Bearer $MARKETING_API_KEY" \
  "https://netgrid-16f6.onrender.com/api/v1/clients?email=owner@pizzacrosta.ca"

# One client with sites + scores
curl -H "Authorization: Bearer $MARKETING_API_KEY" \
  https://netgrid-16f6.onrender.com/api/v1/clients/96c4f390-67f5-4687-8376-8c7c400972a2
```

### Node (marketing app backend)

```ts
const BASE = process.env.NETGRID_API_URL;   // https://netgrid-16f6.onrender.com
const KEY = process.env.NETGRID_API_KEY;     // = netgrid's MARKETING_API_KEY

async function getClientDashboard(email: string) {
  const headers = { Authorization: `Bearer ${KEY}` };

  // 1. Resolve the logged-in user to their netgrid client
  const list = await fetch(
    `${BASE}/api/v1/clients?email=${encodeURIComponent(email)}`,
    { headers },
  ).then((r) => r.json());

  const client = list.clients[0];
  if (!client) return null;

  // 2. Pull sites + SEO scores for that client
  return fetch(`${BASE}/api/v1/clients/${client.id}`, { headers }).then((r) =>
    r.json(),
  );
}
```

---

## Notes

- **Read-only.** Responses are field-whitelisted — platform credentials
  (WordPress passwords, Shopify tokens/secrets), internal notes, and custom
  prompts are never exposed.
- All timestamps are ISO 8601 (UTC).
- No pagination yet — the list returns all clients. (Fine for the current
  client count; add pagination if it grows large.)

## Roadmap (not yet implemented)

- **Score history** — per-site SEO score time-series for trend charts.
- **Posts** — published post titles / URLs per site.
- Per-client API keys / rate limiting if the API is exposed more widely.
