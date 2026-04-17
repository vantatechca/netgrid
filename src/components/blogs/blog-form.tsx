"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { createBlogSchema, type CreateBlogInput } from "@/lib/validators/blog";
import { createBlog, updateBlog } from "@/lib/actions/blog-actions";
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
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ClientOption {
  id: string;
  name: string;
}

interface BlogFormProps {
  mode: "create" | "edit";
  blogId?: string;
  clients: ClientOption[];
  defaultValues?: Partial<CreateBlogInput>;
  defaultClientId?: string;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function BlogForm({
  mode,
  blogId,
  clients,
  defaultValues,
  defaultClientId,
}: BlogFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const form = useForm({
    resolver: zodResolver(createBlogSchema),
    defaultValues: {
      clientId: defaultClientId || defaultValues?.clientId || "",
      domain: defaultValues?.domain || "",
      wpUrl: defaultValues?.wpUrl || "",
      wpUsername: defaultValues?.wpUsername || "",
      wpAppPassword: defaultValues?.wpAppPassword || "",
      seoPlugin: defaultValues?.seoPlugin || "none",
      hostingProvider: defaultValues?.hostingProvider || "",
      hostingLoginUrl: defaultValues?.hostingLoginUrl || "",
      hostingUsername: defaultValues?.hostingUsername || "",
      hostingPassword: defaultValues?.hostingPassword || "",
      registrar: defaultValues?.registrar || "",
      registrarLoginUrl: defaultValues?.registrarLoginUrl || "",
      registrarUsername: defaultValues?.registrarUsername || "",
      registrarPassword: defaultValues?.registrarPassword || "",
      domainExpiryDate: defaultValues?.domainExpiryDate || "",
      hostingExpiryDate: defaultValues?.hostingExpiryDate || "",
      sslExpiryDate: defaultValues?.sslExpiryDate || "",
      postingFrequency: defaultValues?.postingFrequency || "",
      postingFrequencyDays: defaultValues?.postingFrequencyDays ?? undefined,
      status: defaultValues?.status || "setup",
      notesInternal: defaultValues?.notesInternal || "",
    },
  });

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = form;

  const onSubmit = (data: CreateBlogInput) => {
    startTransition(async () => {
      let result;
      if (mode === "create") {
        result = await createBlog(data);
      } else {
        result = await updateBlog(blogId!, data);
      }

      if ("error" in result) {
        toast.error(result.error);
        return;
      }

      toast.success(mode === "create" ? "Blog created" : "Blog updated");
      if (mode === "create" && "id" in result) {
        router.push(`/blogs/${result.id}`);
      } else {
        router.push(`/blogs/${blogId}`);
      }
      router.refresh();
    });
  };

  // Helper to render a field group
  const Field = ({
    label,
    name,
    type = "text",
    placeholder,
  }: {
    label: string;
    name: keyof CreateBlogInput;
    type?: string;
    placeholder?: string;
  }) => (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        type={type}
        placeholder={placeholder}
        {...register(name)}
      />
      {errors[name] && (
        <p className="text-xs text-destructive">
          {errors[name]?.message as string}
        </p>
      )}
    </div>
  );

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Identity Section */}
      <Card>
        <CardHeader>
          <CardTitle>Identity</CardTitle>
          <CardDescription>Basic blog identification</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {/* Client Selector */}
          <div className="space-y-1.5">
            <Label htmlFor="clientId">Client</Label>
            <Select
              value={watch("clientId")}
              onValueChange={(v) => setValue("clientId", v, { shouldValidate: true })}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a client" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.clientId && (
              <p className="text-xs text-destructive">{errors.clientId.message}</p>
            )}
          </div>

          <Field label="Domain" name="domain" placeholder="example.com" />
          <Field label="WordPress URL" name="wpUrl" placeholder="https://example.com" />

          {/* Status Selector */}
          <div className="space-y-1.5">
            <Label htmlFor="status">Status</Label>
            <Select
              value={watch("status")}
              onValueChange={(v) =>
                setValue("status", v as CreateBlogInput["status"], { shouldValidate: true })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
                <SelectItem value="setup">Setup</SelectItem>
                <SelectItem value="decommissioned">Decommissioned</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* WordPress Credentials */}
      <Card>
        <CardHeader>
          <CardTitle>WordPress Credentials</CardTitle>
          <CardDescription>REST API authentication details</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="WP Username" name="wpUsername" placeholder="admin" />
          <Field
            label="WP Application Password"
            name="wpAppPassword"
            type="password"
            placeholder="xxxx xxxx xxxx xxxx"
          />
          <div className="space-y-1.5">
            <Label htmlFor="seoPlugin">SEO Plugin</Label>
            <Select
              value={watch("seoPlugin")}
              onValueChange={(v) =>
                setValue("seoPlugin", v as CreateBlogInput["seoPlugin"], {
                  shouldValidate: true,
                })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select SEO plugin" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="yoast">Yoast SEO</SelectItem>
                <SelectItem value="rankmath">Rank Math</SelectItem>
                <SelectItem value="none">None</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Hosting */}
      <Card>
        <CardHeader>
          <CardTitle>Hosting</CardTitle>
          <CardDescription>Hosting provider credentials and expiry</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Hosting Provider" name="hostingProvider" placeholder="SiteGround" />
          <Field
            label="Login URL"
            name="hostingLoginUrl"
            placeholder="https://my.siteground.com"
          />
          <Field label="Username" name="hostingUsername" />
          <Field label="Password" name="hostingPassword" type="password" />
          <Field label="Hosting Expiry Date" name="hostingExpiryDate" type="date" />
        </CardContent>
      </Card>

      {/* Domain Registrar */}
      <Card>
        <CardHeader>
          <CardTitle>Domain Registrar</CardTitle>
          <CardDescription>Domain registration details</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Registrar" name="registrar" placeholder="Namecheap" />
          <Field
            label="Login URL"
            name="registrarLoginUrl"
            placeholder="https://ap.www.namecheap.com"
          />
          <Field label="Username" name="registrarUsername" />
          <Field label="Password" name="registrarPassword" type="password" />
          <Field label="Domain Expiry Date" name="domainExpiryDate" type="date" />
        </CardContent>
      </Card>

      {/* SSL */}
      <Card>
        <CardHeader>
          <CardTitle>SSL Certificate</CardTitle>
        </CardHeader>
        <CardContent>
          <Field label="SSL Expiry Date" name="sslExpiryDate" type="date" />
        </CardContent>
      </Card>

      {/* Posting Config */}
      <Card>
        <CardHeader>
          <CardTitle>Posting Configuration</CardTitle>
          <CardDescription>Expected posting schedule</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Posting Frequency"
            name="postingFrequency"
            placeholder="3x per week"
          />
          <div className="space-y-1.5">
            <Label htmlFor="postingFrequencyDays">Frequency (days)</Label>
            <Input
              id="postingFrequencyDays"
              type="number"
              min={1}
              placeholder="e.g. 3"
              {...register("postingFrequencyDays")}
            />
            {errors.postingFrequencyDays && (
              <p className="text-xs text-destructive">
                {errors.postingFrequencyDays.message as string}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Notes */}
      <Card>
        <CardHeader>
          <CardTitle>Internal Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="Internal notes about this blog..."
            rows={4}
            {...register("notesInternal")}
          />
        </CardContent>
      </Card>

      <Separator />

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="size-4 animate-spin" data-icon="inline-start" />}
          {mode === "create" ? "Create Blog" : "Save Changes"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isPending}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
