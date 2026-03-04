import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { MAX_ESCROW_SATS, MAX_CONCURRENT_ACTIVE_TASKS } from "@/lib/types";
import { authenticateRequest } from "@/lib/api-key-auth";

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json(
      { data: null, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { agent } = auth;
  const supabase = createClient();

  // CRITICAL-3: Check concurrent active task limit
  const { count: activeTasks } = await supabase
    .from("tasks")
    .select("*", { count: "exact", head: true })
    .or(
      `buyer_agent_id.eq.${agent.id},seller_agent_id.eq.${agent.id}`
    )
    .in("state", ["FUNDED", "DELIVERED", "DISPUTED"]);

  if ((activeTasks ?? 0) >= MAX_CONCURRENT_ACTIVE_TASKS) {
    return NextResponse.json(
      {
        data: null,
        error: `Concurrent task limit exceeded: max ${MAX_CONCURRENT_ACTIVE_TASKS} active tasks (FUNDED + DELIVERED + DISPUTED) per agent`,
      },
      { status: 429 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { data: null, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const {
    title,
    description,
    amount_sats,
    seller_alias,
    delivery_deadline,
    verification_deadline,
    arbiter_alias,
  } = body as {
    title?: string;
    description?: string;
    amount_sats?: number;
    seller_alias?: string;
    delivery_deadline?: string;
    verification_deadline?: string;
    arbiter_alias?: string;
  };

  // Validate title
  if (!title || typeof title !== "string" || title.trim().length === 0) {
    return NextResponse.json(
      { data: null, error: "Title is required and must be a non-empty string" },
      { status: 400 }
    );
  }

  // Validate description
  if (!description || typeof description !== "string" || description.trim().length === 0) {
    return NextResponse.json(
      { data: null, error: "Description is required and must be a non-empty string" },
      { status: 400 }
    );
  }

  // Validate amount_sats: positive integer, max 1,000,000
  if (
    amount_sats === undefined ||
    typeof amount_sats !== "number" ||
    !Number.isInteger(amount_sats) ||
    amount_sats <= 0
  ) {
    return NextResponse.json(
      { data: null, error: "amount_sats must be a positive integer" },
      { status: 400 }
    );
  }

  if (amount_sats > MAX_ESCROW_SATS) {
    return NextResponse.json(
      {
        data: null,
        error: `amount_sats cannot exceed ${MAX_ESCROW_SATS.toLocaleString()} sats`,
      },
      { status: 400 }
    );
  }

  // Validate delivery_deadline must be in the future
  if (delivery_deadline) {
    const deadlineDate = new Date(delivery_deadline);
    if (isNaN(deadlineDate.getTime())) {
      return NextResponse.json(
        { data: null, error: "delivery_deadline must be a valid date" },
        { status: 400 }
      );
    }
    if (deadlineDate <= new Date()) {
      return NextResponse.json(
        { data: null, error: "delivery_deadline must be in the future" },
        { status: 400 }
      );
    }
  }

  // Resolve seller — cannot equal buyer
  let seller_agent_id: string | null = null;
  if (seller_alias) {
    const { data: seller } = await supabase
      .from("agents")
      .select("id")
      .eq("alias", seller_alias)
      .single();

    if (!seller) {
      return NextResponse.json(
        { data: null, error: `Seller agent "${seller_alias}" not found` },
        { status: 404 }
      );
    }

    if (seller.id === agent.id) {
      return NextResponse.json(
        { data: null, error: "seller_agent_id cannot equal buyer_agent_id" },
        { status: 400 }
      );
    }

    seller_agent_id = seller.id;
  }

  // Resolve arbiter — cannot equal buyer or seller
  let arbiter_agent_id: string | null = null;
  if (arbiter_alias) {
    const { data: arbiter } = await supabase
      .from("agents")
      .select("id")
      .eq("alias", arbiter_alias)
      .single();

    if (!arbiter) {
      return NextResponse.json(
        { data: null, error: `Arbiter agent "${arbiter_alias}" not found` },
        { status: 404 }
      );
    }

    if (arbiter.id === agent.id) {
      return NextResponse.json(
        { data: null, error: "arbiter_agent_id cannot equal buyer_agent_id" },
        { status: 400 }
      );
    }

    if (seller_agent_id && arbiter.id === seller_agent_id) {
      return NextResponse.json(
        { data: null, error: "arbiter_agent_id cannot equal seller_agent_id" },
        { status: 400 }
      );
    }

    arbiter_agent_id = arbiter.id;
  }

  const { data: task, error } = await supabase
    .from("tasks")
    .insert({
      buyer_agent_id: agent.id,
      seller_agent_id,
      title: title.trim(),
      description: description || null,
      amount_sats,
      state: "CREATED",
      delivery_deadline: delivery_deadline || null,
      verification_deadline: verification_deadline || null,
      arbiter_agent_id,
    })
    .select()
    .single();

  if (error) {
    console.log("[TASK CREATE] Error:", error.message);
    return NextResponse.json(
      { data: null, error: error.message },
      { status: 500 }
    );
  }

  console.log(`[TASK CREATE] ${task.id} → CREATED (${amount_sats} sats)`);

  return NextResponse.json({ data: task, error: null }, { status: 201 });
}
