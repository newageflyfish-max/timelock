-- Timelock Database Schema
-- Run this in your Supabase SQL editor to create all tables

-- Agents table
create table if not exists public.agents (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  user_id uuid references auth.users not null,
  alias text not null unique,
  pubkey text,
  reputation_score integer default 500,
  total_tasks_completed integer default 0,
  total_tasks_disputed integer default 0,
  total_sats_earned bigint default 0,
  total_sats_paid bigint default 0,
  last_active timestamptz default now(),
  metadata jsonb default '{}'::jsonb
);

-- Tasks table
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  buyer_agent_id uuid references public.agents(id) not null,
  seller_agent_id uuid references public.agents(id),
  title text not null,
  description text,
  deliverable_url text,
  amount_sats bigint not null,
  state text not null default 'CREATED',
  payment_hash text,
  delivery_deadline timestamptz,
  verification_deadline timestamptz,
  arbiter_agent_id uuid references public.agents(id),
  metadata jsonb default '{}'::jsonb
);

-- Escrow holds table
create table if not exists public.escrow_holds (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.tasks(id) not null,
  amount_sats bigint not null,
  hold_invoice text,
  release_invoice text,
  refund_invoice text,
  state text default 'PENDING',
  held_at timestamptz,
  released_at timestamptz,
  created_at timestamptz default now()
);

-- Verification results table
create table if not exists public.verification_results (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.tasks(id) not null,
  verifier_agent_id uuid references public.agents(id) not null,
  result text not null,
  score integer,
  evidence_url text,
  notes text,
  created_at timestamptz default now()
);

-- Disputes table
create table if not exists public.disputes (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.tasks(id) not null,
  opened_by uuid references public.agents(id) not null,
  reason text not null,
  evidence text,
  state text default 'OPEN',
  resolution text,
  resolved_by uuid references public.agents(id),
  resolved_at timestamptz,
  created_at timestamptz default now()
);

-- Reputation events table
create table if not exists public.reputation_events (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references public.agents(id) not null,
  -- nullable: system events (DECAY) have no associated task
  task_id uuid references public.tasks(id),
  event_type text not null,
  score_delta integer not null,
  created_at timestamptz default now()
);

-- API keys table (for MCP / programmatic access)
create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references public.agents(id) not null,
  key_hash text not null unique,
  name text,
  last_used timestamptz,
  created_at timestamptz default now(),
  revoked_at timestamptz -- null = active
);

-- Indexes
create index if not exists idx_agents_user_id on public.agents(user_id);
create index if not exists idx_agents_alias on public.agents(alias);
create index if not exists idx_tasks_buyer on public.tasks(buyer_agent_id);
create index if not exists idx_tasks_seller on public.tasks(seller_agent_id);
create index if not exists idx_tasks_state on public.tasks(state);
create index if not exists idx_escrow_task on public.escrow_holds(task_id);
create index if not exists idx_disputes_task on public.disputes(task_id);
create index if not exists idx_reputation_agent on public.reputation_events(agent_id);
create index if not exists idx_api_keys_hash on public.api_keys(key_hash);
create index if not exists idx_api_keys_agent on public.api_keys(agent_id);

-- Row Level Security
alter table public.agents enable row level security;
alter table public.tasks enable row level security;
alter table public.escrow_holds enable row level security;
alter table public.verification_results enable row level security;
alter table public.disputes enable row level security;
alter table public.reputation_events enable row level security;

-- Agents policies
create policy "Agents are viewable by everyone" on public.agents
  for select using (true);

create policy "Users can create their own agent" on public.agents
  for insert with check (auth.uid() = user_id);

create policy "Users can update their own agent" on public.agents
  for update using (auth.uid() = user_id);

-- Tasks policies
create policy "Tasks are viewable by everyone" on public.tasks
  for select using (true);

create policy "Agents can create tasks" on public.tasks
  for insert with check (
    exists (select 1 from public.agents where id = buyer_agent_id and user_id = auth.uid())
  );

create policy "Task participants can update tasks" on public.tasks
  for update using (
    exists (
      select 1 from public.agents
      where user_id = auth.uid()
      and (id = buyer_agent_id or id = seller_agent_id or id = arbiter_agent_id)
    )
  );

-- Escrow policies
create policy "Escrow holds are viewable by task participants" on public.escrow_holds
  for select using (
    exists (
      select 1 from public.tasks t
      join public.agents a on (a.id = t.buyer_agent_id or a.id = t.seller_agent_id)
      where t.id = task_id and a.user_id = auth.uid()
    )
  );

create policy "Escrow holds can be created by task buyer" on public.escrow_holds
  for insert with check (
    exists (
      select 1 from public.tasks t
      join public.agents a on a.id = t.buyer_agent_id
      where t.id = task_id and a.user_id = auth.uid()
    )
  );

-- Verification results policies
create policy "Verification results are viewable by everyone" on public.verification_results
  for select using (true);

create policy "Task buyer can create verification results" on public.verification_results
  for insert with check (
    exists (
      select 1 from public.tasks t
      join public.agents a on a.id = t.buyer_agent_id
      where t.id = task_id and a.user_id = auth.uid()
    )
  );

-- Disputes policies
create policy "Disputes are viewable by everyone" on public.disputes
  for select using (true);

create policy "Task participants can create disputes" on public.disputes
  for insert with check (
    exists (
      select 1 from public.tasks t
      join public.agents a on (a.id = t.buyer_agent_id or a.id = t.seller_agent_id)
      where t.id = task_id and a.user_id = auth.uid()
    )
  );

-- Reputation events policies
create policy "Reputation events are viewable by everyone" on public.reputation_events
  for select using (true);

create policy "System can create reputation events" on public.reputation_events
  for insert with check (
    exists (select 1 from public.agents where id = agent_id and user_id = auth.uid())
  );

-- API keys policies
alter table public.api_keys enable row level security;

create policy "Users can view their own API keys" on public.api_keys
  for select using (
    exists (select 1 from public.agents where id = agent_id and user_id = auth.uid())
  );

create policy "Users can create API keys for their agent" on public.api_keys
  for insert with check (
    exists (select 1 from public.agents where id = agent_id and user_id = auth.uid())
  );

create policy "Users can update their own API keys" on public.api_keys
  for update using (
    exists (select 1 from public.agents where id = agent_id and user_id = auth.uid())
  );

-- CRITICAL-1: Atomic state transition with row-level locking
-- Use via supabase.rpc('transition_task_state', { ... })
-- Defense-in-depth: application layer uses CAS (compare-and-swap) pattern,
-- this RPC provides an additional row-level lock for critical transitions.
CREATE OR REPLACE FUNCTION transition_task_state(
  p_task_id uuid,
  p_expected_state text,
  p_new_state text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_task record;
BEGIN
  -- Acquire row-level lock
  SELECT * INTO v_task
  FROM public.tasks
  WHERE id = p_task_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Task not found');
  END IF;

  IF v_task.state != p_expected_state THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Task is in state %s, expected %s', v_task.state, p_expected_state),
      'current_state', v_task.state
    );
  END IF;

  -- Validate transition against state machine
  IF NOT (
    (p_expected_state = 'CREATED' AND p_new_state = 'FUNDED') OR
    (p_expected_state = 'FUNDED' AND p_new_state IN ('DELIVERED', 'EXPIRED')) OR
    (p_expected_state = 'DELIVERED' AND p_new_state IN ('VERIFIED', 'DISPUTED')) OR
    (p_expected_state = 'VERIFIED' AND p_new_state = 'SETTLED') OR
    (p_expected_state = 'DISPUTED' AND p_new_state = 'RESOLVED') OR
    (p_expected_state = 'RESOLVED' AND p_new_state = 'SETTLED') OR
    (p_expected_state = 'EXPIRED' AND p_new_state = 'REFUNDED')
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Invalid transition: %s -> %s', p_expected_state, p_new_state)
    );
  END IF;

  -- Execute the transition
  UPDATE public.tasks SET state = p_new_state WHERE id = p_task_id;

  RETURN jsonb_build_object(
    'success', true,
    'previous_state', v_task.state,
    'new_state', p_new_state
  );
END;
$$;
