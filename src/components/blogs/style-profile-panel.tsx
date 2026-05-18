import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";
import type { StyleProfile } from "@/lib/content/types";
import { SUB_NICHES } from "@/lib/content/libraries/sub-niches";
import { VOICES } from "@/lib/content/libraries/voices";
import { ARCHETYPES } from "@/lib/content/libraries/archetypes";
import { SKELETONS } from "@/lib/content/libraries/skeletons";
import { CADENCES } from "@/lib/content/libraries/cadences";
import { SCHEMAS } from "@/lib/content/libraries/schemas";
import { TAG_SETS } from "@/lib/content/libraries/tag-sets";
import { CITATION_STYLES } from "@/lib/content/libraries/citation-styles";
import { QUIRKS } from "@/lib/content/libraries/quirks";
import { TEMPLATES } from "@/lib/content/libraries/templates";

interface StyleProfilePanelProps {
  profile: StyleProfile;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  );
}

export function StyleProfilePanel({ profile }: StyleProfilePanelProps) {
  const voice = VOICES[profile.voiceId];
  const archetype = voice ? ARCHETYPES[voice.archetype] : null;
  const skeleton = SKELETONS[profile.skeletonId];
  const cadence = CADENCES[profile.cadenceId];
  const schema = SCHEMAS[profile.schemaId];
  const tagSet = TAG_SETS[profile.tagSetId];
  const citation = CITATION_STYLES[profile.citationStyleId];
  const subNiche = SUB_NICHES[profile.subNicheId];

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4" />
          Style Profile
        </CardTitle>
        <CardDescription>
          Locked configuration assigned at blog creation. Drives the prompt
          composer and scrubber for every post.
          {profile.minHammingAtAssign !== undefined && (
            <span className="ml-2">
              Min-Hamming at assign:{" "}
              <strong>{profile.minHammingAtAssign.toFixed(1)}</strong>
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Row label="Sub-niche">
          {subNiche
            ? `${subNiche.name} (#${subNiche.id})`
            : `#${profile.subNicheId}`}
        </Row>
        <Row label="Voice">
          <div className="flex flex-col gap-0.5">
            <span>
              V{profile.voiceId} · {voice?.name ?? "(unknown)"}
            </span>
            {archetype && (
              <span className="text-xs text-muted-foreground">
                Archetype A{archetype.id}: {archetype.name}
              </span>
            )}
          </div>
        </Row>
        <Row label="Skeleton">
          S{profile.skeletonId} · {skeleton?.name ?? "(unknown)"}
        </Row>
        <Row label="Cadence">
          {cadence ? `${cadence.name}` : `#${profile.cadenceId}`}
        </Row>
        <Row label="Schema">
          {schema ? `${schema.code} · ${schema.name}` : `#${profile.schemaId}`}
        </Row>
        <Row label="Tag set">
          {tagSet ? tagSet.name : `#${profile.tagSetId}`}
        </Row>
        <Row label="Citation style">
          {citation ? citation.name : `#${profile.citationStyleId}`}
        </Row>
        <Row label="Word band">
          {profile.wordBandMin}–{profile.wordBandMax} words
        </Row>
        <Row label="Strictness">
          <Badge
            variant={
              profile.scrubberStrictness === "strict"
                ? "default"
                : profile.scrubberStrictness === "loose"
                  ? "secondary"
                  : "outline"
            }
          >
            {profile.scrubberStrictness}
          </Badge>
        </Row>
        <Row label="Quirks">
          <div className="flex flex-wrap gap-1">
            {profile.quirks.map((qid) => (
              <Badge key={qid} variant="outline" className="text-xs">
                {QUIRKS[qid]?.name ?? `Q${qid}`}
              </Badge>
            ))}
          </div>
        </Row>
        <Row label="Compliance">
          <div className="space-y-1">
            <Badge variant="outline" className="text-xs">
              {profile.compliancePlacement}
            </Badge>
            <p className="text-xs text-muted-foreground">
              Phrases: {profile.compliancePhraseIds.join(", ")}
            </p>
          </div>
        </Row>
        <Row label="Template pool">
          <div className="flex flex-wrap gap-1">
            {profile.structuralPool.map((tid) => (
              <Badge key={tid} variant="outline" className="text-xs">
                {TEMPLATES[tid]?.code ?? `T${tid}`}
              </Badge>
            ))}
          </div>
        </Row>
        <Row label="Primary compounds">
          <div className="flex flex-wrap gap-1">
            {profile.primaryCompounds.map((c) => (
              <Badge key={c} variant="default" className="text-xs">
                {c}
              </Badge>
            ))}
          </div>
        </Row>
        <Row label="Secondary compounds">
          <div className="flex flex-wrap gap-1">
            {profile.secondaryCompounds.map((c) => (
              <Badge key={c} variant="secondary" className="text-xs">
                {c}
              </Badge>
            ))}
          </div>
        </Row>
      </CardContent>
    </Card>
  );
}
