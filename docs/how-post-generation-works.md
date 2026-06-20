# How the Blog Network Generates Posts

*A plain-language overview of how each site decides what to write, how it writes
it, and how we keep hundreds of sites from looking the same.*

---

## 1. The big picture

We run a network of blogs across many niches (peptides, gambling, roofing, real
estate, web development, and so on). Each blog publishes original, SEO-oriented
articles automatically on a schedule, posting straight to its WordPress or
Shopify site.

Two ideas make the whole system work:

1. **Every site has its own locked "writing personality"** (we call it a *style
   profile*). This is what stops the network from looking mass-produced.
2. **Every post is built in stages** — pick a topic, write the article against
   that site's personality, clean it up, and publish — with quality and
   compliance checks along the way.

---

## 2. The "posting profile" — each site's writing personality

When a blog is created, the system automatically assigns it a **style profile**
and locks it in. Nobody picks this by hand. Once set, it never changes — that
blog writes with the same personality for its entire life.

A profile is a combination of ~14 traits, including:

- **Voice** — the persona it writes as (e.g. "skeptical reviewer," "field
  technician," "magazine columnist").
- **Sentence rhythm** — short and punchy vs. long and flowing, etc.
- **Article structure** — how it lays out headings, lists, FAQs, comparisons.
- **Vocabulary quirks**, **length range**, **how it cites sources**, and the
  **compliance disclaimers** it must include.

### How a profile is assigned (and why each site is different)

The assignment is based on three things:

- **The site's own ID** — used as a fixed "seed," so the choice is stable and
  repeatable for that site, but different from its neighbors.
- **The niche** — this decides which pool of voices, sub-topics, rules, and
  disclaimers the site can draw from.
- **What the rest of the network already looks like** — the system balances its
  choices so sites spread out across the available options instead of all
  landing on the same voice.

Finally, there's a **uniqueness check**: after building a profile, the system
measures how similar it is to the other sites in the same niche. If it's too
close to an existing one, it reshuffles some traits to push it further apart.

**The result:** every site has its own deterministic, balanced, and deliberately
distinct writing fingerprint — different voice, rhythm, structure, vocabulary,
and length from its siblings. This is our main defense against the network being
recognized as a single operation.

---

## 3. The post-generation workflow (step by step)

When it's time for a site to publish, the system runs these stages:

1. **Pick a topic** (*"ideation"*) — the system proposes a fresh, specific topic
   the site hasn't covered before. (Details on where topics come from in §4.)
2. **Write the article** — the article is written against that site's locked
   profile (its voice, rhythm, structure, length, etc.) and the niche's rules.
3. **Add images** — a relevant hero image and an in-body image are generated and
   embedded.
4. **Clean-up & quality pass** — the draft is automatically scrubbed for
   "AI-sounding" tells (banned filler phrases, em-dashes, repeated headings),
   checked against the niche's required disclaimers, and tidied.
5. **Add the call-to-action** (if the client has one configured) — a button to
   the client's main site, placed top / middle / bottom as configured.
6. **Publish** — posted to the live WordPress or Shopify site, including the SEO
   title and meta description.

Each finished post is logged with its cost so we can report on spend per blog,
per client, and per time window.

---

## 4. Where topics come from

Topics are proposed automatically, and the system blends several sources in
priority order:

1. **The site's locked focus** — especially in peptides, each site is anchored to
   its own specific sub-topics, and topics must stay on that anchor. This is what
   keeps sites in the same niche from writing about the same things.
2. **The client's Knowledge Base** (see §6) — if the client uploaded briefs or
   reference docs, the topics lean on those.
3. **Recent news** — for news-driven niches (e.g. new gym openings), current
   headlines feed in as topical hooks.
4. **The niche's built-in topic list** — a curated fallback list of subjects for
   that niche, used when nothing more specific applies.

The system also checks the site's **recent post titles** and deliberately avoids
repeating them, so a blog doesn't keep covering the same ground.

---

## 5. Where keywords come from

Keywords work on the same layered idea:

1. **Per-post keywords** — chosen alongside each topic, tailored to that specific
   article. These take priority.
2. **Knowledge Base keywords** — when a client uploads keyword sheets, briefs, or
   brand docs, the system *mines* them for the exact terms and topics that client
   cares about, and those steer the writing.
3. **The niche's built-in keyword list** — each niche ships a curated set of
   real, on-topic terms (e.g. gambling: "RTP," "wagering requirements," "closing
   line value"; roofing: "asphalt shingles," "storm damage claims") used as a
   fallback seed.

On top of keywords, each niche also enforces **real vocabulary rules** — e.g.
"use actual RTP percentages," "name real manufacturers," "cite real cost ranges."
That keeps the content concrete and credible rather than generic.

---

## 6. How the niche and the Knowledge Base work together

This is a common question, so to be clear: **they work hand in hand, not one
instead of the other.**

- **The niche** is the *rulebook and guardrails*: the industry framing, the brand
  voice, the posting rules, the compliance disclaimers, the required real-world
  vocabulary, and the fallback keyword/topic lists.
- **The Knowledge Base** is the *client's own material*: briefs, keyword sheets,
  brand guides, even images. We upload these per client, and the system converts
  them and mines them for keywords and topics. The writing is told to **use these
  facts and never contradict them.**

So the precedence is:

| Question | What decides it |
|---|---|
| *What should this post be about / which keywords?* | **Knowledge Base** leads; the niche's lists are the fallback |
| *Which facts and brand specifics are correct?* | **Knowledge Base** is authoritative |
| *What voice, structure, disclaimers, and rules apply?* | **The niche** always governs this |

In short: the **Knowledge Base decides what to say and which facts are true**,
and the **niche decides how it's said and what's not allowed.**

> **Important operational note:** all of this curated behavior only switches on
> when a client's niche matches one of our registered niches. If a niche is typed
> as free text that doesn't match (e.g. "payments" instead of "payment
> processing"), the site still produces on-topic content, but it falls back to a
> generic profile and loses the niche's curated rules, keyword seeds, and
> vocabulary. We're moving the niche field to a **dropdown selection** so this
> can't happen by accident.

---

## 7. Quality and compliance, on every post

Regardless of niche, every post passes through always-on checks:

- **Anti-"AI tells"** — banned filler phrases, em-dashes/smart quotes, and
  duplicate headings are stripped.
- **Niche compliance** — e.g. responsible-gambling language for gambling sites,
  medical disclaimers for peptides, "not legal/tax advice" for tax and real
  estate.
- **SEO essentials** — proper title, meta description, heading structure, and
  unique internal anchors.

---

## 8. Why this matters (the bottom line)

- **Scale:** sites publish on their own, on schedule, with no manual writing.
- **Distinctiveness:** each site has a locked, unique writing personality, so the
  network doesn't read as one operation — which protects it as we grow to
  hundreds of sites.
- **Relevance:** niche rules keep content credible and compliant; the Knowledge
  Base lets us inject each client's real keywords, facts, and brand voice.
- **Accountability:** every post's cost is tracked and reportable by blog,
  client, and date range.
