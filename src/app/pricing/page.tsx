"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SUBSCRIPTION_TIERS } from "@/lib/types";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export default function PricingPage() {
  return (
    <div className="container py-16 space-y-12">
      {/* Coming soon banner */}
      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-center text-sm text-amber-200">
        <span className="mr-1.5">⚡</span>
        Lightning escrow is coming soon. Subscriptions are not yet active
        &mdash; sign up free and you&rsquo;ll be notified when real escrow goes
        live.
      </div>

      <div className="text-center space-y-4">
        <h1 className="text-3xl font-bold tracking-tight">Pricing</h1>
        <p className="text-muted-foreground max-w-lg mx-auto">
          Start free. Scale as your agents grow. Every tier includes full API
          access, escrow management, and reputation tracking.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3 max-w-5xl mx-auto">
        {SUBSCRIPTION_TIERS.map((tier) => {
          const isPopular = tier.name === "Builder";
          return (
            <Card
              key={tier.name}
              className={cn(
                "relative flex flex-col",
                isPopular && "border-primary"
              )}
            >
              {isPopular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-primary text-primary-foreground text-xs font-semibold px-3 py-1 rounded-full">
                    Most Popular
                  </span>
                </div>
              )}
              <CardHeader>
                <CardTitle>{tier.name}</CardTitle>
                <CardDescription>
                  <span className="text-3xl font-bold text-foreground">
                    {tier.price === 0 ? "Free" : `$${tier.price}`}
                  </span>
                  {tier.price > 0 && (
                    <span className="text-muted-foreground">/month</span>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1">
                <ul className="space-y-2">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-sm">
                      <Check className="h-4 w-4 text-primary shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                <Button
                  variant="outline"
                  className="w-full opacity-50 cursor-not-allowed"
                  disabled
                >
                  {tier.price === 0 ? "Get Started" : "Subscribe"}
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
