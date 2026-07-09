"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
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
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { NicheCombobox } from "@/components/content/niche-combobox";
import { isPeptidesNiche } from "@/lib/content/cta-target";
import {
  defaultLanguageModeForNiche,
  languageModeFromToggles,
  togglesFromLanguageMode,
} from "@/lib/content/language";

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
    control,
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
      notesInternal: defaultValues?.notesInternal ?? "",
      customPrompt: defaultValues?.customPrompt ?? "",
      stackPersona: defaultValues?.stackPersona ?? false,
      ctaEnabled: defaultValues?.ctaEnabled ?? false,
      ctaLabel: defaultValues?.ctaLabel ?? "",
      ctaUrl: defaultValues?.ctaUrl ?? "",
      ctaPlacement: defaultValues?.ctaPlacement ?? "bottom",
      // Explicit stored mode wins; a client that never set one shows the
      // checkboxes that match its legacy niche-derived behaviour.
      languageMode:
        defaultValues?.languageMode ??
        defaultLanguageModeForNiche(defaultValues?.niche),
    },
  });

  const ctaEnabled = !!watch("ctaEnabled");
  // Peptides blogs forward to the public domain each blog is hosted on, so their
  // CTA is auto-sourced per blog from the blog's own domain — no URL is typed
  // here, and the button is always shown.
  const isPeptides = isPeptidesNiche(watch("niche"));

  function onSubmit(data: CreateClientInput) {
    startTransition(async () => {
      try {
        if (mode === "edit" && defaultValues?.id) {
          await updateClient(defaultValues.id, data);
          toast.success("Client updated successfully");
          router.push(`/clients/${defaultValues.id}`);
        } else {
          const newClient = await createClient(data);
          toast.success("Client created — add reference docs to the Knowledge Base");
          // Land on the new client's Knowledge tab so uploading documents is
          // the natural next step right after creation.
          router.push(`/clients/${newClient.id}?tab=knowledge`);
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
            <Controller
              control={control}
              name="niche"
              render={({ field }) => (
                <NicheCombobox
                  value={field.value ?? ""}
                  onChange={field.onChange}
                />
              )}
            />
            <p className="text-xs text-muted-foreground">
              Drives auto-generated post topics, brand voice, and compliance.
              Pick an existing niche or type a new name to create one (its config
              is AI-drafted and editable in Content Studio &rarr; Niches).
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
              across ALL of this client&apos;s blogs combined. Set to{" "}
              <span className="font-medium">0</span> for no cap. When the
              cap is reached, every blog for this client stops publishing
              until you edit this number higher.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Custom generation prompt */}
      <Card>
        <CardHeader>
          <CardTitle>Custom generation prompt</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="customPrompt" className="sr-only">
            Custom generation prompt
          </Label>
          <Textarea
            id="customPrompt"
            rows={6}
            placeholder="Optional. e.g. Write as a 15-year commercial roofer talking to facility managers. Lead with a real cost range, then walk through the decision. Blunt, no fluff, cite manufacturer warranties by name..."
            className="font-mono text-xs"
            {...register("customPrompt")}
          />
          <p className="text-xs text-muted-foreground">
            When set, <strong>all this client&apos;s blogs</strong> are generated
            from this prompt instead of the niche/persona style. A per-blog custom
            prompt (on the blog page) overrides it. Compliance disclaimers and the
            required output format are always enforced on top. Leave blank to use
            the niche/persona style.
          </p>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div className="pr-4">
              <Label htmlFor="stackPersona" className="text-sm">
                Keep each blog&apos;s persona on top of this prompt
              </Label>
              <p className="text-xs text-muted-foreground">
                When on, the blog&apos;s generated voice/persona is layered onto
                the custom prompt instead of being replaced by it. Only affects
                blogs that already have a generated persona. Leave off for a plain
                custom-prompt voice.
              </p>
            </div>
            <Controller
              control={control}
              name="stackPersona"
              render={({ field }) => (
                <Switch
                  id="stackPersona"
                  checked={!!field.value}
                  onCheckedChange={field.onChange}
                />
              )}
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

      {/* Action button (CTA) */}
      <Card>
        <CardHeader>
          <CardTitle>Action Button</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-md border p-3">
            <div className="pr-4">
              <Label htmlFor="ctaEnabled" className="text-sm">
                Add an action button to this client&apos;s posts
              </Label>
              <p className="text-xs text-muted-foreground">
                {isPeptides
                  ? "For peptides, the button is added automatically and links to each blog's own domain — no URL needed. The toggle just lets you customize its text and placement."
                  : "Appends a button to the bottom of every published post — links to the client's main site, contact, or registration page."}
              </p>
            </div>
            <Controller
              control={control}
              name="ctaEnabled"
              render={({ field }) => (
                <Switch
                  id="ctaEnabled"
                  checked={!!field.value}
                  onCheckedChange={field.onChange}
                />
              )}
            />
          </div>

          {ctaEnabled && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="ctaLabel">Button text</Label>
                <Input
                  id="ctaLabel"
                  placeholder={isPeptides ? "Shop now!" : "Visit our site"}
                  {...register("ctaLabel")}
                  aria-invalid={!!errors.ctaLabel}
                />
                {errors.ctaLabel && (
                  <p className="text-sm text-destructive">
                    {errors.ctaLabel.message}
                  </p>
                )}
                {isPeptides && (
                  <p className="text-xs text-muted-foreground">
                    Optional — defaults to &ldquo;Shop now!&rdquo;.
                  </p>
                )}
              </div>
              {isPeptides ? (
                <div className="space-y-2">
                  <Label>Button link (URL)</Label>
                  <div className="flex h-9 items-center rounded-md border border-dashed border-input px-3 text-sm text-muted-foreground">
                    Auto-filled per blog from each blog&apos;s own domain
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="ctaUrl">Button link (URL)</Label>
                  <Input
                    id="ctaUrl"
                    placeholder="https://example.com/register"
                    {...register("ctaUrl")}
                    aria-invalid={!!errors.ctaUrl}
                  />
                  {errors.ctaUrl && (
                    <p className="text-sm text-destructive">
                      {errors.ctaUrl.message}
                    </p>
                  )}
                </div>
              )}
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="ctaPlacement">Placement</Label>
                <select
                  id="ctaPlacement"
                  {...register("ctaPlacement")}
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="bottom">Bottom only</option>
                  <option value="top_bottom">Top &amp; bottom</option>
                  <option value="top_middle_bottom">Top, middle &amp; bottom</option>
                </select>
                <p className="text-xs text-muted-foreground">
                  Where the button appears within each post.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Post language */}
      <Card>
        <CardHeader>
          <CardTitle>Post language</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Which language(s) this client&apos;s posts are written in. Pick one
            for a single language, or both to alternate English and French
            (every other post). This overrides automatic per-niche language
            rules.
          </p>
          <Controller
            control={control}
            name="languageMode"
            render={({ field }) => {
              const toggles = togglesFromLanguageMode(field.value);
              const set = (en: boolean, fr: boolean) => {
                const mode = languageModeFromToggles(en, fr);
                // Never allow both off — keep at least one language on.
                if (mode) field.onChange(mode);
              };
              return (
                <div className="flex flex-wrap gap-6">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={toggles.en}
                      onCheckedChange={(v) => set(!!v, toggles.fr)}
                    />
                    English
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={toggles.fr}
                      onCheckedChange={(v) => set(toggles.en, !!v)}
                    />
                    French
                  </label>
                </div>
              );
            }}
          />
          {watch("languageMode") === "en_fr" && (
            <p className="text-xs text-muted-foreground">
              Posts alternate strictly: English, French, English, French… (per
              blog, starting with English).
            </p>
          )}
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
