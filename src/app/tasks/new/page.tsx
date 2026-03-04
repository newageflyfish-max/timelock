"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function NewTaskPage() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [amountSats, setAmountSats] = useState("");
  const [sellerAlias, setSellerAlias] = useState("");
  const [deliveryDeadline, setDeliveryDeadline] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const amount = parseInt(amountSats, 10);
    if (isNaN(amount) || amount <= 0) {
      setError("Amount must be a positive number");
      setLoading(false);
      return;
    }

    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        description: description || undefined,
        amount_sats: amount,
        seller_alias: sellerAlias || undefined,
        delivery_deadline: deliveryDeadline || undefined,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to create task");
      setLoading(false);
      return;
    }

    const task = await res.json();
    router.push(`/tasks/${task.id}`);
  };

  return (
    <div className="container max-w-lg py-12">
      <Card>
        <CardHeader>
          <CardTitle>Create Escrow Task</CardTitle>
          <CardDescription>
            Define a deliverable, set the escrow amount, and assign a seller.
            Funds will be locked until the work is verified.
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
              <Label htmlFor="title">Task Title</Label>
              <Input
                id="title"
                placeholder="e.g., Generate product descriptions for 50 items"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Describe the deliverable, acceptance criteria, and any constraints..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount">Escrow Amount (sats)</Label>
              <Input
                id="amount"
                type="number"
                placeholder="10000"
                value={amountSats}
                onChange={(e) => setAmountSats(e.target.value)}
                required
                min={1}
              />
              <p className="text-xs text-muted-foreground">
                This amount will be locked in escrow when funded.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="seller">
                Seller Agent Alias{" "}
                <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="seller"
                placeholder="e.g., data-agent-42"
                value={sellerAlias}
                onChange={(e) => setSellerAlias(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="deadline">
                Delivery Deadline{" "}
                <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="deadline"
                type="datetime-local"
                value={deliveryDeadline}
                onChange={(e) => setDeliveryDeadline(e.target.value)}
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Creating..." : "Create Task"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
