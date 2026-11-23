-- =====================================================================
-- FixGo · 0001 · Bảng dữ liệu (mục 7 của đặc tả)
-- =====================================================================
create extension if not exists postgis with schema extensions;

-- Mọi hàm mới mặc định KHÔNG ai được gọi; chỉ cấp quyền rõ ràng ở 0006.
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;

create table public.admins (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.customers (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  provider text not null default 'email',
  push_token text,
  created_at timestamptz not null default now()
);

create table public.mechanics (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  provider text not null default 'email',
  profile_status text not null default 'none' check (profile_status in ('none','pending','approved','rejected')),
  account_status text not null default 'active' check (account_status in ('active','locked')),
  presence text not null default 'offline' check (presence in ('online','offline')),
  face_photo text,
  full_name text,
  phone text,
  birth_date date,
  skills text[] not null default '{}',
  experience text,
  id_full_name text,
  id_number text,
  id_front text,
  id_back text,
  pending_changes jsonb,            -- BR-16: thay đổi hồ sơ chờ admin duyệt
  pending_changes_at timestamptz,
  review_note text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  location extensions.geography(Point, 4326),
  location_at timestamptz,
  current_order_id uuid,            -- BR-13: đơn đang được chốt
  rating_avg numeric(3,2) not null default 0,
  rating_count integer not null default 0,
  completed_count integer not null default 0,
  push_token text,
  created_at timestamptz not null default now()
);
create index mechanics_location_gix on public.mechanics using gist (location);
create index mechanics_dispatchable_idx on public.mechanics (presence, profile_status, account_status);
create index mechanics_pending_idx on public.mechanics (profile_status) where profile_status = 'pending';
create unique index mechanics_current_order_uq on public.mechanics (current_order_id) where current_order_id is not null;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id),
  mechanic_id uuid references public.mechanics(id),
  status text not null default 'searching' check (status in
    ('searching','selected','traveling','arrived','quote_pending','repairing','awaiting_payment','completed','cancelled')),
  location extensions.geography(Point, 4326) not null,
  lat double precision not null,
  lng double precision not null,
  address text not null,
  incident_types text[] not null,
  vehicle_model text not null,
  license_plate text not null,
  description text not null,
  media jsonb not null default '[]'::jsonb,
  selected_proposal_id uuid,
  dispatched_at timestamptz,        -- BR-14: chỉ phát một lần
  created_at timestamptz not null default now(),
  selected_at timestamptz,
  arrived_at timestamptz,
  repair_completed_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by text check (cancelled_by in ('customer','mechanic')),
  cancel_reason text,
  review_status text not null default 'none' check (review_status in ('none','skipped','submitted')),
  current_quote_version integer not null default 0
);
create index orders_customer_idx on public.orders (customer_id, created_at desc);
create index orders_mechanic_idx on public.orders (mechanic_id, created_at desc);
create index orders_status_idx on public.orders (status);

-- BR-12 ở mức CSDL: mỗi khách tối đa MỘT đơn đang chặn (trạng thái 1–6, hoặc 7 khi chưa đánh giá).
create unique index orders_one_blocking_per_customer on public.orders (customer_id)
  where status in ('searching','selected','traveling','arrived','quote_pending','repairing')
     or (status = 'awaiting_payment' and review_status = 'none');

alter table public.mechanics
  add constraint mechanics_current_order_fk foreign key (current_order_id) references public.orders(id) on delete set null;

create table public.dispatches (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  mechanic_id uuid not null references public.mechanics(id) on delete cascade,
  customer_id uuid not null references public.customers(id),
  route_distance_m integer not null,
  status text not null default 'sent' check (status in ('sent','accepted','declined','proposed','removed')),
  draft jsonb,
  ai_result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, mechanic_id)
);
create index dispatches_mechanic_idx on public.dispatches (mechanic_id, status);
create index dispatches_order_idx on public.dispatches (order_id, status);

create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  mechanic_id uuid not null references public.mechanics(id) on delete cascade,
  customer_id uuid not null references public.customers(id),
  assessment text not null,
  price_min integer not null check (price_min >= 0),
  price_max integer not null,
  eta_minutes integer not null check (eta_minutes > 0),
  status text not null default 'available' check (status in ('available','unavailable')),
  created_at timestamptz not null default now(),
  unique (order_id, mechanic_id),
  check (price_max >= price_min)
);
create index proposals_mechanic_idx on public.proposals (mechanic_id, status);
create index proposals_order_idx on public.proposals (order_id, status);

alter table public.orders
  add constraint orders_selected_proposal_fk foreign key (selected_proposal_id) references public.proposals(id) on delete set null;

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  version integer not null,
  diagnosis text not null,
  status text not null default 'sent' check (status in ('sent','confirmed','superseded')),
  total bigint not null default 0,
  sent_at timestamptz not null default now(),
  confirmed_at timestamptz,
  unique (order_id, version)
);

create table public.quote_lines (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  line_key uuid not null,
  kind text not null check (kind in ('task','part')),
  name text not null,
  quantity integer not null check (quantity > 0),
  unit_price bigint not null check (unit_price >= 0),
  amount bigint not null,
  sort integer not null default 0
);
create index quote_lines_quote_idx on public.quote_lines (quote_id, sort);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  sender_id uuid not null,
  sender_role text not null check (sender_role in ('customer','mechanic')),
  content text not null,
  stream_message_id text unique,
  created_at timestamptz not null default now()
);
create index chat_messages_order_idx on public.chat_messages (order_id, created_at);

create table public.reviews (
  order_id uuid primary key references public.orders(id) on delete cascade,
  customer_id uuid not null references public.customers(id),
  mechanic_id uuid not null references public.mechanics(id),
  stars integer not null check (stars between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);
create index reviews_mechanic_idx on public.reviews (mechanic_id);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  customer_id uuid not null references public.customers(id),
  mechanic_id uuid references public.mechanics(id),
  kind text not null check (kind in ('mechanic','rescue_issue')),
  content text not null,
  status text not null default 'open' check (status in ('open','resolved')),
  resolution text,
  resolved_by uuid references public.admins(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index reports_status_idx on public.reports (status, created_at desc);

create table public.location_logs (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  mechanic_id uuid not null references public.mechanics(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  recorded_at timestamptz not null default now()
);
create index location_logs_order_idx on public.location_logs (order_id, recorded_at);

create table public.order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  from_status text,
  to_status text not null,
  actor text not null default 'system',
  created_at timestamptz not null default now()
);
create index order_events_order_idx on public.order_events (order_id, created_at);

-- Hàng đợi push / đóng chat: Database Webhook trên bảng này gọi Edge Function outbox-worker.
create table public.outbox (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('push','chat_close')),
  user_id uuid,
  role text check (role in ('customer','mechanic')),
  title text,
  body text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  error text
);
