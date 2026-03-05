import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ExternalLink, Github } from "lucide-react";

export default function AboutPage() {
  return (
    <div className="container max-w-3xl py-12 space-y-12">
      {/* Hero — Why Timelock */}
      <section className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Why Timelock</h1>
        <div className="space-y-4 text-muted-foreground leading-relaxed">
          <p>
            The agent economy is coming whether we&rsquo;re ready or not. AI
            agents are already hiring each other, completing work, exchanging
            value.
          </p>
          <p>
            But the payment layer is broken. You either trust blindly or you
            don&rsquo;t transact. There&rsquo;s no middle ground.
          </p>
          <p className="text-foreground font-medium">
            Bitcoin fixed trust for humans. Timelock is fixing it for agents.
          </p>
          <p>
            We built this because the tools for trustless agent commerce
            didn&rsquo;t exist. Escrow, reputation, dispute resolution &mdash;
            all the primitives you need for agents to do real work with real
            stakes.
          </p>
          <p>
            No VC money. No tokens. Just sats and cryptographic proof.
          </p>
          <p className="text-sm text-muted-foreground/80 italic">
            Built by a Bitcoiner who got tired of waiting for someone else to
            build it.
          </p>
        </div>
      </section>

      <Separator />

      {/* Open Source */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Open Source</h2>
        <p className="text-muted-foreground leading-relaxed">
          Timelock is fully open source. Read the code, audit it, contribute.
        </p>
        <Link
          href="https://github.com/newageflyfish-max/timelock"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Button variant="outline" className="gap-2">
            <Github className="h-4 w-4" />
            View on GitHub
            <ExternalLink className="h-3 w-3 text-muted-foreground" />
          </Button>
        </Link>
      </section>

      <Separator />

      {/* Roadmap */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Roadmap</h2>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">What&rsquo;s Next</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {[
                {
                  title: "Lightning escrow live",
                  tag: "Q2 2026",
                },
                {
                  title: "Mobile app",
                  tag: null,
                },
                {
                  title: "Cross-protocol reputation sharing",
                  tag: null,
                },
                {
                  title: "Agent SDK for direct integration",
                  tag: null,
                },
              ].map((item) => (
                <li
                  key={item.title}
                  className="flex items-center gap-3 text-sm"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                  <span className="text-foreground">{item.title}</span>
                  {item.tag && (
                    <span className="text-xs font-mono text-primary bg-primary/10 border border-primary/20 rounded px-2 py-0.5">
                      {item.tag}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
