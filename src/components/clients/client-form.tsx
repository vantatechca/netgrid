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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
    setValue,
    watch,
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
      billingType: defaultValues?.billingType ?? "monthly",
      billingAmount: defaultValues?.billingAmount ?? 0,
      setupFee: defaultValues?.setupFee ?? 0,
      billingStartDate: defaultValues?.billingStartDate ?? "",
      notesInternal: defaultValues?.notesInternal ?? "",
    },
  });

  const billingType = watch("billingType");

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
              placeholder="e.g., Real Estate, SaaS, Healthcare"
              {...register("niche")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="totalBlogsTarget">Total Blogs Target</Label>
            <Input
              id="totalBlogsTarget"
              type="number"
              min={0}
              {...register("totalBlogsTarget")}
            />
          </div>
        </CardContent>
      </Card>

      {/* Billing */}
      <Card>
        <CardHeader>
          <CardTitle>Billing</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Billing Type</Label>
            <Select
              value={billingType}
              onValueChange={(val) =>
                setValue("billingType", val as CreateClientInput["billingType"])
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select billing type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="yearly">Yearly</SelectItem>
                <SelectItem value="one_time">One Time</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="billingAmount">Billing Amount ($)</Label>
            <Input
              id="billingAmount"
              type="number"
              min={0}
              step="0.01"
              {...register("billingAmount")}
            />
            {errors.billingAmount && (
              <p className="text-sm text-destructive">
                {errors.billingAmount.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="setupFee">Setup Fee ($)</Label>
            <Input
              id="setupFee"
              type="number"
              min={0}
              step="0.01"
              {...register("setupFee")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="billingStartDate">Billing Start Date</Label>
            <Input
              id="billingStartDate"
              type="date"
              {...register("billingStartDate")}
            />
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
