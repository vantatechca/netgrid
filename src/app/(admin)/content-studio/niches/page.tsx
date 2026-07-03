import Link from "next/link";
import { getNiches } from "@/lib/actions/niche-actions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChevronRight, Info } from "lucide-react";
import { SyncNichesButton, ImportNicheButton } from "@/components/niches/niche-admin";

export const dynamic = "force-dynamic";

export const metadata = { title: "Niches" };

export default async function NichesPage() {
  const niches = await getNiches();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Niches</h1>
          <p className="text-muted-foreground">
            Per-niche generation config — voice, style, topics, requirements, and
            compliance. Edit here instead of in code.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ImportNicheButton />
          <SyncNichesButton />
        </div>
      </div>

      {/* Live notice */}
      <Card className="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/40">
        <CardContent className="flex items-start gap-3 py-4 text-sm">
          <Info className="mt-0.5 size-4 shrink-0 text-blue-600" />
          <p className="text-blue-800 dark:text-blue-200">
            <strong>These rows drive generation.</strong> Editing a niche and
            saving <strong>changes the next generated posts</strong> for that
            niche — no deploy needed. Seeded rows are byte-identical to the old
            hardcoded rules (confirm with <strong>Preview prompt</strong> inside a
            niche). If a niche has no row, generation falls back to code, so
            nothing breaks. Use <strong>Sync from code</strong> to (re)seed any
            missing niches.
          </p>
        </CardContent>
      </Card>

      {niches.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No niches yet. Click <strong>Sync from code</strong> to seed them from
            the current hardcoded config.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Niche</TableHead>
                  <TableHead>Industry</TableHead>
                  <TableHead className="text-right">Key topics</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="w-[40px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {niches.map((n) => {
                  const topicCount = Array.isArray(n.keyTopics)
                    ? (n.keyTopics as string[]).length
                    : 0;
                  return (
                    <TableRow key={n.id} className="cursor-pointer">
                      <TableCell className="font-medium">
                        <Link
                          href={`/content-studio/niches/${n.id}`}
                          className="block hover:underline"
                        >
                          {n.label}
                          <span className="ml-2 text-xs text-muted-foreground">
                            {n.key}
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {n.industry}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {topicCount}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={n.source === "manual" ? "default" : "secondary"}
                          className="font-normal"
                        >
                          {n.source}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Link href={`/content-studio/niches/${n.id}`}>
                          <ChevronRight className="size-4 text-muted-foreground" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
