"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  FileText,
  Loader2,
  Trash2,
  Upload,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  uploadKnowledgeDocument,
  setKnowledgeDocumentActive,
  deleteKnowledgeDocument,
  type listKnowledgeDocuments,
} from "@/lib/actions/knowledge-actions";

type KnowledgeDoc = Awaited<ReturnType<typeof listKnowledgeDocuments>>[number];

const ACCEPT =
  ".xlsx,.xls,.csv,.docx,.pdf,.txt,.md,image/png,image/jpeg,image/webp,image/gif";

const statusVariant: Record<string, "default" | "secondary" | "destructive"> = {
  extracted: "default",
  pending: "secondary",
  failed: "destructive",
};

export function KnowledgeBasePanel({
  clientId,
  documents,
}: {
  clientId: string;
  documents: KnowledgeDoc[];
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [pending, start] = useTransition();

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    let ok = 0;
    for (const file of Array.from(files)) {
      const t = toast.loading(`Processing ${file.name}…`, {
        description: "Converting and extracting keywords.",
      });
      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("clientId", clientId);
        const doc = await uploadKnowledgeDocument(fd);
        ok++;
        if (doc.extractionStatus === "failed") {
          toast.warning(`${file.name} stored, but keyword extraction failed`, {
            id: t,
            description: "The document is saved; you can delete and re-upload.",
          });
        } else if (doc.lowConfidence) {
          toast.warning(`${file.name} stored with low-confidence extraction`, {
            id: t,
            description: "Looks scanned/image-only — review the keywords.",
          });
        } else {
          toast.success(`${file.name} added`, {
            id: t,
            description: `${(doc.extractedKeywords as string[] | null)?.length ?? 0} keywords extracted.`,
          });
        }
      } catch (e) {
        toast.error(`Failed to add ${file.name}`, {
          id: t,
          description: e instanceof Error ? e.message : "Unknown error",
        });
      }
    }
    setUploading(false);
    if (fileInput.current) fileInput.current.value = "";
    if (ok > 0) router.refresh();
  };

  const handleToggle = (id: string, isActive: boolean) => {
    start(async () => {
      try {
        await setKnowledgeDocumentActive(id, isActive);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not update document");
      }
    });
  };

  const handleDelete = (id: string, fileName: string) => {
    if (!confirm(`Delete "${fileName}" from the Knowledge Base?`)) return;
    start(async () => {
      try {
        await deleteKnowledgeDocument(id);
        toast.success("Document deleted");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not delete document");
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Knowledge Base</CardTitle>
            <CardDescription>
              Upload briefs, keyword sheets, and brand guides. Each file is
              converted and mined for keywords/topics that steer this client&apos;s
              post ideation and writing.
            </CardDescription>
          </div>
          <Button
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Upload className="size-4" />
            )}
            Upload
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>
      </CardHeader>
      <CardContent>
        {documents.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <FileText className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No documents yet. Upload .xlsx, .csv, .docx, .pdf, images, or text.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Keywords</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.map((doc) => {
                const keywords = (doc.extractedKeywords as string[] | null) ?? [];
                return (
                  <TableRow key={doc.id}>
                    <TableCell className="max-w-[220px]">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-medium" title={doc.fileName}>
                          {doc.fileName}
                        </span>
                        {doc.lowConfidence && (
                          <AlertTriangle
                            className="size-3.5 shrink-0 text-amber-600"
                            aria-label="Low-confidence extraction"
                          />
                        )}
                      </div>
                      {doc.summary && (
                        <p className="truncate text-xs text-muted-foreground" title={doc.summary}>
                          {doc.summary}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {doc.sourceType}
                      {doc.blogId ? " · blog" : " · client-wide"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant[doc.extractionStatus] ?? "secondary"}>
                        {doc.extractionStatus}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[260px]">
                      {keywords.length > 0 ? (
                        <span
                          className="line-clamp-2 text-xs text-muted-foreground"
                          title={keywords.join(", ")}
                        >
                          {keywords.slice(0, 6).join(", ")}
                          {keywords.length > 6 ? ` +${keywords.length - 6}` : ""}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={doc.isActive}
                        disabled={pending}
                        onCheckedChange={(v) => handleToggle(doc.id, v)}
                        aria-label="Use in ideation"
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={pending}
                        onClick={() => handleDelete(doc.id, doc.fileName)}
                      >
                        <Trash2 className="size-4 text-muted-foreground" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
