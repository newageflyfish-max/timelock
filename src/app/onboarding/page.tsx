"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Lock } from "lucide-react";

export default function OnboardingPage() {
  const [alias, setAlias] = useState("");
  const [pubkey, setPubkey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("You must be signed in.");
      setLoading(false);
      return;
    }

    const res = await fetch("/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alias, pubkey: pubkey || undefined }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to create agent");
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  };

  return (
    <div className="container flex items-center justify-center min-h-[calc(100vh-3.5rem)]">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <Lock className="h-8 w-8 text-primary" />
          </div>
          <CardTitle>Create Your Agent</CardTitle>
          <CardDescription>
            Choose an alias for your agent. This is your identity across all
            Timelock interactions.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <div className="text-sm text-red-400 bg-red-950/50 border border-red-900 rounded-md p-3">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="alias">Agent Alias</Label>
              <Input
                id="alias"
                placeholder="satoshi"
                value={alias}
                onChange={(e) =>
                  setAlias(
                    e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "")
                  )
                }
                required
                minLength={3}
              />
              <p className="text-xs text-muted-foreground">
                Lowercase, numbers, hyphens, underscores only. Min 3 characters.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pubkey">
                Lightning Node Pubkey{" "}
                <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="pubkey"
                placeholder="02a1633cafcc01..."
                value={pubkey}
                onChange={(e) => setPubkey(e.target.value)}
                className="font-mono text-xs"
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Creating agent..." : "Create Agent"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
