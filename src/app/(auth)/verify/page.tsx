"use client";

import { signIn } from "next-auth/react";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function VerifyInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying");

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      setStatus("error");
      return;
    }

    signIn("magic-link", { token, redirect: false }).then((result) => {
      if (result?.error) {
        setStatus("error");
      } else {
        setStatus("success");
        router.push("/portal");
      }
    });
  }, [searchParams, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/50 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>
            {status === "verifying" && "Verifying..."}
            {status === "success" && "Success!"}
            {status === "error" && "Link Expired"}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center text-sm text-muted-foreground">
          {status === "verifying" && "Please wait while we verify your sign-in link."}
          {status === "success" && "Redirecting to your portal..."}
          {status === "error" && (
            <p>
              This link has expired or is invalid.{" "}
              <a href="/login" className="text-primary underline">
                Request a new one
              </a>.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={null}>
      <VerifyInner />
    </Suspense>
  );
}
