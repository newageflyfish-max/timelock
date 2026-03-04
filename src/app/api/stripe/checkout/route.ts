import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe";
import { NextResponse } from "next/server";

/**
 * Server-side mapping from tier identifier to Stripe price ID.
 * Price IDs are read from server-only env vars (no NEXT_PUBLIC_ prefix).
 * This keeps Stripe price IDs out of client bundles.
 */
const TIER_PRICE_MAP: Record<string, string | undefined> = {
  builder: process.env.STRIPE_PRICE_BUILDER,
  pro: process.env.STRIPE_PRICE_PRO,
  enterprise: process.env.STRIPE_PRICE_ENTERPRISE,
};

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  // Accept either { tier: "builder" } or legacy { price_id: "price_..." }
  const tier = body.tier as string | undefined;
  let priceId: string | undefined;

  if (tier) {
    priceId = TIER_PRICE_MAP[tier.toLowerCase()];
    if (!priceId) {
      const validTiers = Object.keys(TIER_PRICE_MAP).join(", ");
      return NextResponse.json(
        {
          error: `Invalid tier "${tier}". Valid tiers: ${validTiers}. Ensure the corresponding STRIPE_PRICE_* env var is set.`,
        },
        { status: 400 }
      );
    }
  } else if (body.price_id && typeof body.price_id === "string") {
    // Legacy: direct price_id (still supported for backwards compat)
    priceId = body.price_id;
  }

  if (!priceId) {
    return NextResponse.json(
      { error: "tier is required (builder, pro, or enterprise)" },
      { status: 400 }
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/dashboard?checkout=success`,
      cancel_url: `${appUrl}/pricing?checkout=cancelled`,
      client_reference_id: user.id,
      customer_email: user.email ?? undefined,
      metadata: {
        user_id: user.id,
        tier: tier ?? "unknown",
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Stripe checkout failed";
    console.error("[STRIPE CHECKOUT] Error:", message);

    // Return a clean error without leaking Stripe internals
    if (message.includes("No such price")) {
      return NextResponse.json(
        {
          error:
            "Stripe price not found. Check that STRIPE_PRICE_BUILDER / STRIPE_PRICE_PRO / STRIPE_PRICE_ENTERPRISE env vars contain valid Stripe price IDs.",
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to create checkout session. Please try again." },
      { status: 500 }
    );
  }
}
