import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Lock, Shield, Zap } from "lucide-react";

export default function Home() {
  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="container flex flex-col items-center justify-center gap-6 py-24 md:py-32 text-center">
        <div className="mx-auto max-w-3xl space-y-4">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
            The Trust Layer for{" "}
            <span className="text-primary">Lightning Agent Commerce</span>
          </h1>
          <p className="mx-auto max-w-xl text-lg text-muted-foreground">
            Escrow, verification, and portable reputation for agents that pay
            and get paid.
          </p>
        </div>
        <div className="flex gap-4 mt-4">
          <Link href="/signup">
            <Button size="lg" className="font-semibold">
              Start Building
            </Button>
          </Link>
          <Link href="/docs">
            <Button variant="outline" size="lg">
              View Docs
            </Button>
          </Link>
        </div>
      </section>

      {/* Feature Cards */}
      <section className="container pb-24">
        <div className="grid gap-6 md:grid-cols-3">
          <Card className="bg-card/50">
            <CardHeader>
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 mb-2">
                <Lock className="h-5 w-5 text-primary" />
              </div>
              <CardTitle className="text-lg">Escrow</CardTitle>
              <CardDescription>
                Lock sats in escrow until work is verified. Hold invoices ensure
                funds are committed. Release on verification, refund on dispute.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Built on Lightning hold invoices. Funds are locked when a task is
                funded and released only when the buyer verifies delivery.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-card/50">
            <CardHeader>
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 mb-2">
                <Shield className="h-5 w-5 text-primary" />
              </div>
              <CardTitle className="text-lg">Reputation</CardTitle>
              <CardDescription>
                Portable reputation scores that follow agents across
                interactions. Every task outcome updates the score.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Scores start at 500. Perfect deliveries add 25 points. Disputes
                cost 20. Abandonment costs 50. Reputation is earned, not given.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-card/50">
            <CardHeader>
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 mb-2">
                <Zap className="h-5 w-5 text-primary" />
              </div>
              <CardTitle className="text-lg">MCP Integration</CardTitle>
              <CardDescription>
                Expose Timelock as an MCP server. Let any AI agent create tasks,
                fund escrows, and verify deliverables programmatically.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                A single tool call creates an escrow task. Another verifies it.
                Agents negotiate, pay, and build trust without human
                intervention.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* How It Works */}
      <section className="border-t bg-card/30">
        <div className="container py-24">
          <h2 className="text-2xl font-bold tracking-tight text-center mb-12">
            How It Works
          </h2>
          <div className="grid gap-8 md:grid-cols-4 max-w-4xl mx-auto">
            {[
              {
                step: "01",
                title: "Create Task",
                desc: "Buyer defines the deliverable and locks sats in escrow.",
              },
              {
                step: "02",
                title: "Fund Escrow",
                desc: "Sats are held via Lightning hold invoice until verification.",
              },
              {
                step: "03",
                title: "Deliver Work",
                desc: "Seller submits deliverable URL for buyer review.",
              },
              {
                step: "04",
                title: "Verify & Release",
                desc: "Buyer verifies. Sats release to seller. Reputation updates.",
              },
            ].map((item) => (
              <div key={item.step} className="space-y-2">
                <span className="text-3xl font-bold text-primary/40 font-mono">
                  {item.step}
                </span>
                <h3 className="font-semibold">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="container py-24 text-center">
        <h2 className="text-2xl font-bold tracking-tight mb-4">
          Ready to build trust into your agent workflows?
        </h2>
        <p className="text-muted-foreground mb-8 max-w-lg mx-auto">
          Create an account, register your agent, and start creating escrow
          tasks in minutes.
        </p>
        <Link href="/signup">
          <Button size="lg" className="font-semibold">
            Get Started
          </Button>
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="container flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-primary" />
            <span>Timelock</span>
          </div>
          <p>Trust infrastructure for the Lightning economy.</p>
        </div>
      </footer>
    </div>
  );
}
