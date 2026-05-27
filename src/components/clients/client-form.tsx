"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  createClientSchema,
  type CreateClientInput,
} from "@/lib/validators/client";
import { createClient, updateClient } from "@/lib/actions/client-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface ClientFormProps {
  mode: "create" | "edit";
  defaultValues?: Partial<CreateClientInput> & { id?: string };
}

export function ClientForm({ mode, defaultValues }: ClientFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(createClientSchema),
    defaultValues: {
      name: defaultValues?.name ?? "",
      contactName: defaultValues?.contactName ?? "",
      contactEmail: defaultValues?.contactEmail ?? "",
      contactPhone: defaultValues?.contactPhone ?? "",
      niche: defaultValues?.niche ?? "",
      totalBlogsTarget: defaultValues?.totalBlogsTarget ?? 0,
      notesInternal: defaultValues?.notesInternal ?? "",
    },
  });

  function onSubmit(data: CreateClientInput) {
    startTransition(async () => {
      try {
        if (mode === "edit" && defaultValues?.id) {
          await updateClient(defaultValues.id, data);
          toast.success("Client updated successfully");
          router.push(`/clients/${defaultValues.id}`);
        } else {
          const newClient = await createClient(data);
          toast.success("Client created successfully");
          router.push(`/clients/${newClient.id}`);
        }
        router.refresh();
      } catch {
        toast.error(
          mode === "edit"
            ? "Failed to update client"
            : "Failed to create client"
        );
      }
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Basic Information */}
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="name">Client / Company Name *</Label>
            <Input
              id="name"
              placeholder="Acme Corp"
              {...register("name")}
              aria-invalid={!!errors.name}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="contactName">Contact Name</Label>
            <Input
              id="contactName"
              placeholder="John Smith"
              {...register("contactName")}
            />
            {errors.contactName && (
              <p className="text-sm text-destructive">
                {errors.contactName.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="contactEmail">Contact Email</Label>
            <Input
              id="contactEmail"
              type="email"
              placeholder="john@acme.com"
              {...register("contactEmail")}
              aria-invalid={!!errors.contactEmail}
            />
            {errors.contactEmail && (
              <p className="text-sm text-destructive">
                {errors.contactEmail.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="contactPhone">Contact Phone</Label>
            <Input
              id="contactPhone"
              type="tel"
              placeholder="+1 (555) 000-0000"
              {...register("contactPhone")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="niche">Niche</Label>
            <Input
              id="niche"
              placeholder="e.g., peptides, web_dev, gambling"
              {...register("niche")}
            />
            <p className="text-xs text-muted-foreground">
              Used to drive auto-generated post topics and brand voice. Match
              one of the predefined niche keys for best results.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="totalBlogsTarget">Total Posts Cap (network-wide)</Label>
            <Input
              id="totalBlogsTarget"
              type="number"
              min={0}
              {...register("totalBlogsTarget")}
            />
            <p className="text-xs text-muted-foreground">
              Maximum number of posts the auto-publish cron will create
              across ALL of this client's blogs combined. Set to{" "}
              <span className="font-medium">0</span> for no cap. When the
              cap is reached, every blog for this client stops publishing
              until you edit this number higher.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Notes */}
      <Card>
        <CardHeader>
          <CardTitle>Internal Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="notesInternal">Notes (internal only)</Label>
            <Textarea
              id="notesInternal"
              placeholder="Add any internal notes about this client..."
              rows={4}
              {...register("notesInternal")}
            />
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
          {mode === "edit" ? "Update Client" : "Create Client"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
