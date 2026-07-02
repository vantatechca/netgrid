import Link from "next/link";
import { notFound } from "next/navigation";
import { getNicheById } from "@/lib/actions/niche-actions";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft } from "lucide-react";
import { NicheEditor, NichePromptPreview } from "@/components/niches/niche-admin";

export const dynamic = "force-dynamic";

export default async function NicheEditPage({
  params,
}: {
  params: { id: string };
}) {
  const niche = await getNicheById(params.id);
  if (!niche) notFound();

  return (
    <div className="space-y-6">
      <Link
        href="/content-studio/niches"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> All niches
      </Link>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                {niche.label}
                <span className="text-sm font-normal text-muted-foreground">
                  {niche.key}
                </span>
              </CardTitle>
              <CardDescription>
                Editing here marks the niche as hand-edited. Generation is
                unaffected until the composer is switched to read from the DB.
              </CardDescription>
            </div>
            <Badge
              variant={niche.source === "manual" ? "default" : "secondary"}
              className="font-normal"
            >
              {niche.source}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <NicheEditor niche={niche} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Prompt parity check</CardTitle>
          <CardDescription>
            Confirm this DB row reproduces the exact system prompt the code
            produces today. Green means switching generation to the DB changes
            nothing; a diff shows how posts would change. Save edits first, then
            re-run.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NichePromptPreview nicheId={niche.id} />
        </CardContent>
      </Card>
    </div>
  );
}
