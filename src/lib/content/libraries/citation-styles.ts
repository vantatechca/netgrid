import type { CitationStyleId, CitationStyleSpec } from "../types";

/**
 * 5 citation styles. The scrubber's Layer 3A dispatches verification by style:
 *   - URL-bearing styles get HTTP HEAD checks
 *   - Author/Year/Journal styles get Crossref lookups
 *   - Style 4 (no citations) is skipped entirely
 *   - Style 5 (community references) is best-effort with rot fallback
 */
export const CITATION_STYLES: Record<CitationStyleId, CitationStyleSpec> = {
  1: {
    id: 1,
    name: "URL inline (PubMed/DOI link)",
    styleDescription:
      "Embed source URLs inline as anchor tags pointing to PubMed, DOI, or publisher landing pages.",
    example:
      'A 2022 study (<a href="https://pubmed.ncbi.nlm.nih.gov/35291232/">PubMed</a>) reported …',
    verifiable: true,
  },
  2: {
    id: 2,
    name: "Author-Year inline",
    styleDescription:
      "Inline citations in (Author Year) format. No URLs. Reference list optional.",
    example: "Recent work (Sikiric 2018) showed elevated VEGF expression …",
    verifiable: true,
  },
  3: {
    id: 3,
    name: "Author-Year-Journal narrative",
    styleDescription:
      "Cite author, year, and journal in narrative prose without parenthetical formatting.",
    example:
      "In a 2020 paper published in Peptides, Chang and colleagues found …",
    verifiable: true,
  },
  4: {
    id: 4,
    name: "No explicit citations",
    styleDescription:
      "Discuss research conclusions without citing individual papers. Use phrases like 'published research shows' or 'the literature on X suggests'.",
    example:
      "Published research on tirzepatide consistently shows greater glycemic control than first-generation GLP-1 agonists.",
    verifiable: false,
  },
  5: {
    id: 5,
    name: "Mixed community references",
    styleDescription:
      "Mix of inline URLs (when reliable) and informal 'the BPC-157 literature' framing. Forum-style.",
    example:
      'Posters in the BPC-157 thread on r/Peptides noted a similar pattern, though no formal study has tested it (<a href="https://pubmed.ncbi.nlm.nih.gov/30551256/">PubMed</a>).',
    verifiable: true,
  },
};

export const CITATION_STYLE_IDS: CitationStyleId[] = [1, 2, 3, 4, 5];

export function citationStyleById(id: CitationStyleId): CitationStyleSpec {
  return CITATION_STYLES[id];
}
