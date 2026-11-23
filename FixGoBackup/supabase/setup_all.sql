-- ======== 0001_schema.sql ========
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


-- ======== 0002_helpers.sql ========
-- =====================================================================
-- FixGo · 0002 · Hàm trợ giúp: phát sự kiện real-time, JSON, nhật ký
-- Real-time dùng Supabase Broadcast từ CSDL (realtime.send) trên kênh riêng tư:
--   user:<uid>   – mỗi người dùng đúng MỘT kênh nhận mọi sự kiện của mình
--   order:<id>   – vị trí thợ khi di chuyển (do app thợ gửi trực tiếp)
--   admin        – sự kiện cho trang quản trị
-- Không dùng polling và không dùng Postgres Changes ⇒ số request tối thiểu.
-- =====================================================================

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where id = auth.uid());
$$;

create or replace function public._emit_topic(p_topic text, p_event text, p_payload jsonb)
returns void language plpgsql security definer set search_path = public, realtime as $$
begin
  perform realtime.send(p_payload, p_event, p_topic, true);
exception when others then
  -- không bao giờ để lỗi real-time làm hỏng giao dịch nghiệp vụ
  raise warning 'realtime emit failed (%): %', p_event, sqlerrm;
end $$;

create or replace function public._emit(p_user uuid, p_event text, p_payload jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user is not null then
    perform public._emit_topic('user:' || p_user::text, p_event, p_payload);
  end if;
end $$;

create or replace function public._push(p_user uuid, p_role text, p_title text, p_body text, p_data jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.outbox (kind, user_id, role, title, body, data)
  values ('push', p_user, p_role, p_title, p_body, coalesce(p_data, '{}'::jsonb));
$$;

create or replace function public._chat_close(p_order uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.outbox (kind, data) values ('chat_close', jsonb_build_object('order_id', p_order));
$$;

-- ───────────── Bộ dựng JSON ─────────────
create or replace function public._mech_json(m public.mechanics) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', m.id, 'full_name', m.full_name, 'face_photo', m.face_photo,
    'rating_avg', m.rating_avg, 'rating_count', m.rating_count, 'completed_count', m.completed_count);
$$;

create or replace function public._mechanic_self_json(m public.mechanics) returns jsonb
language sql stable as $$
  select to_jsonb(m) - array['location','push_token','created_at','pending_changes_at','current_order_id','submitted_at','reviewed_at'];
$$;

create or replace function public._proposal_json(p public.proposals) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', p.id, 'order_id', p.order_id,
    'mechanic', (select public._mech_json(m) from public.mechanics m where m.id = p.mechanic_id),
    'assessment', p.assessment, 'price_min', p.price_min, 'price_max', p.price_max,
    'eta_minutes', p.eta_minutes, 'status', p.status, 'created_at', p.created_at);
$$;

create or replace function public._quote_json(q public.quotes) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', q.id, 'order_id', q.order_id, 'version', q.version, 'diagnosis', q.diagnosis,
    'status', q.status, 'total', q.total, 'sent_at', q.sent_at, 'confirmed_at', q.confirmed_at,
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'line_key', l.line_key, 'kind', l.kind, 'name', l.name,
        'quantity', l.quantity, 'unit_price', l.unit_price, 'amount', l.amount) order by l.sort)
      from public.quote_lines l where l.quote_id = q.id), '[]'::jsonb));
$$;

-- n phiên bản phiếu mới nhất (mới nhất trước)
create or replace function public._quotes_json(p_order uuid, p_n integer default 2) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(public._quote_json(q) order by q.version desc), '[]'::jsonb)
  from public.quotes q
  where q.order_id = p_order
    and q.version > coalesce((select max(version) from public.quotes where order_id = p_order), 0) - p_n;
$$;

create or replace function public._order_json(o public.orders) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', o.id, 'status', o.status, 'customer_id', o.customer_id, 'mechanic_id', o.mechanic_id,
    'lat', o.lat, 'lng', o.lng, 'address', o.address,
    'incident_types', to_jsonb(o.incident_types), 'vehicle_model', o.vehicle_model,
    'license_plate', o.license_plate, 'description', o.description, 'media', o.media,
    'created_at', o.created_at, 'selected_at', o.selected_at, 'completed_at', o.completed_at,
    'cancelled_by', o.cancelled_by, 'cancel_reason', o.cancel_reason,
    'review_status', o.review_status, 'current_quote_version', o.current_quote_version,
    'customer', case when o.mechanic_id is not null then
      (select jsonb_build_object('id', c.id, 'full_name', c.full_name) from public.customers c where c.id = o.customer_id) end,
    'mechanic', (select public._mech_json(m) from public.mechanics m where m.id = o.mechanic_id),
    'proposal', (select jsonb_build_object('id', p.id, 'assessment', p.assessment, 'price_min', p.price_min,
                        'price_max', p.price_max, 'eta_minutes', p.eta_minutes)
                 from public.proposals p where p.id = o.selected_proposal_id));
$$;

create or replace function public._dispatch_json(d public.dispatches) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'order_id', d.order_id, 'status', d.status, 'route_distance_m', d.route_distance_m,
    'draft', d.draft, 'ai_result', d.ai_result, 'created_at', d.created_at,
    'order', (select jsonb_build_object(
        'id', o.id, 'lat', o.lat, 'lng', o.lng, 'address', o.address,
        'incident_types', to_jsonb(o.incident_types), 'vehicle_model', o.vehicle_model,
        'license_plate', o.license_plate, 'description', o.description, 'media', o.media, 'created_at', o.created_at)
      from public.orders o where o.id = d.order_id));
$$;

-- Số thợ đã bấm [Chấp nhận] nhưng chưa gửi đề xuất (U-06)
create or replace function public._accepted_count(p_order uuid) returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.dispatches where order_id = p_order and status = 'accepted';
$$;

create or replace function public._emit_count(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_customer uuid;
begin
  select customer_id into v_customer from public.orders where id = p_order and status = 'searching';
  if v_customer is not null then
    perform public._emit(v_customer, 'ACCEPTANCE_COUNT_CHANGED',
      jsonb_build_object('order_id', p_order, 'count', public._accepted_count(p_order)));
  end if;
end $$;

-- Khoá đơn (luôn khoá ĐƠN trước, sau đó mới khoá THỢ ⇒ không deadlock)
create or replace function public._lock_order_for_mechanic(p_order uuid, p_uid uuid) returns public.orders
language plpgsql security definer set search_path = public as $$
declare v_o public.orders;
begin
  select * into v_o from public.orders where id = p_order for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_o.mechanic_id is distinct from p_uid then raise exception 'FORBIDDEN'; end if;
  return v_o;
end $$;

create or replace function public._lock_order_for_customer(p_order uuid, p_uid uuid) returns public.orders
language plpgsql security definer set search_path = public as $$
declare v_o public.orders;
begin
  select * into v_o from public.orders where id = p_order for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_o.customer_id is distinct from p_uid then raise exception 'FORBIDDEN'; end if;
  return v_o;
end $$;

-- ───────────── Nhật ký trạng thái (BR-11) + tín hiệu cho Admin ─────────────
create or replace function public._trg_orders_log() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_actor text;
begin
  v_actor := case
    when auth.uid() is null then 'system'
    when auth.uid() = new.customer_id then 'customer'
    when auth.uid() = new.mechanic_id then 'mechanic'
    else 'admin' end;
  if tg_op = 'INSERT' then
    insert into public.order_events (order_id, from_status, to_status, actor) values (new.id, null, new.status, v_actor);
  elsif new.status is distinct from old.status then
    insert into public.order_events (order_id, from_status, to_status, actor) values (new.id, old.status, new.status, v_actor);
  else
    return new;
  end if;
  perform public._emit_topic('admin', 'ORDER_CHANGED', jsonb_build_object('order_id', new.id, 'status', new.status));
  return new;
end $$;

create trigger orders_log_trg after insert or update of status on public.orders
  for each row execute function public._trg_orders_log();


-- ======== 0003_rpc_customer.sql ========
-- =====================================================================
-- FixGo · 0003 · RPC cho app Khách hàng
-- Mọi thay đổi dữ liệu đi qua RPC (giao dịch nhất quán); bảng không cho ghi trực tiếp (xem 0006).
-- =====================================================================

create or replace function public.ensure_customer(p_full_name text default null) returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare v_uid uuid := auth.uid(); v_u auth.users; v_row public.customers; v_name text; v_provider text;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into v_u from auth.users where id = v_uid;
  v_provider := coalesce(v_u.raw_app_meta_data->>'provider', 'email');
  v_name := nullif(trim(coalesce(p_full_name, v_u.raw_user_meta_data->>'full_name', v_u.raw_user_meta_data->>'name', '')), '');
  insert into public.customers (id, full_name, email, provider)
  values (v_uid, v_name, v_u.email, v_provider)
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(nullif(trim(coalesce(p_full_name, '')), ''), public.customers.full_name)
  returning * into v_row;
  return jsonb_build_object('id', v_row.id, 'full_name', v_row.full_name, 'email', v_row.email, 'provider', v_row.provider);
end $$;

create or replace function public.update_customer_name(p_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_row public.customers;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_name is null or length(trim(p_name)) = 0 then raise exception 'INVALID_INPUT'; end if;
  update public.customers set full_name = trim(p_name) where id = v_uid returning * into v_row;
  if not found then raise exception 'FORBIDDEN'; end if;
  return jsonb_build_object('id', v_row.id, 'full_name', v_row.full_name, 'email', v_row.email, 'provider', v_row.provider);
end $$;

create or replace function public.register_push_token(p_role text, p_token text) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_role = 'customer' then update public.customers set push_token = p_token where id = v_uid;
  elsif p_role = 'mechanic' then update public.mechanics set push_token = p_token where id = v_uid;
  else raise exception 'INVALID_INPUT'; end if;
end $$;

-- U-04: tạo yêu cầu. BR-12 được đảm bảo bởi unique index orders_one_blocking_per_customer.
create or replace function public.create_rescue_request(
  p_lat double precision, p_lng double precision, p_address text, p_incident_types text[],
  p_vehicle_model text, p_license_plate text, p_description text, p_media jsonb default '[]'::jsonb
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_uid uuid := auth.uid(); v_id uuid; v_json jsonb;
  v_valid text[] := array['flat_tire','wont_start','dead_battery','chain','brakes','hard_start','spark_plug','other'];
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not exists (select 1 from public.customers where id = v_uid) then raise exception 'FORBIDDEN'; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'INVALID_INPUT'; end if;
  if p_incident_types is null or cardinality(p_incident_types) = 0 or not (p_incident_types <@ v_valid) then raise exception 'INVALID_INPUT'; end if;
  if coalesce(trim(p_vehicle_model), '') = '' or coalesce(trim(p_license_plate), '') = ''
     or coalesce(trim(p_description), '') = '' or coalesce(trim(p_address), '') = '' then raise exception 'INVALID_INPUT'; end if;
  if jsonb_typeof(coalesce(p_media, '[]'::jsonb)) <> 'array' then raise exception 'INVALID_INPUT'; end if;
  begin
    insert into public.orders (customer_id, location, lat, lng, address, incident_types, vehicle_model, license_plate, description, media)
    values (v_uid, extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography,
            p_lat, p_lng, trim(p_address), p_incident_types, trim(p_vehicle_model), upper(trim(p_license_plate)),
            trim(p_description), coalesce(p_media, '[]'::jsonb))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'ACTIVE_ORDER_EXISTS';
  end;
  select public._order_json(o) into v_json from public.orders o where o.id = v_id;
  return v_json;
end $$;

-- Trạng thái để khôi phục khi mở lại app / mất kết nối (yêu cầu phi chức năng "Khôi phục trạng thái")
create or replace function public.customer_state() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_o public.orders;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into v_o from public.orders
   where customer_id = v_uid
     and (status in ('searching','selected','traveling','arrived','quote_pending','repairing')
          or (status = 'awaiting_payment' and review_status = 'none'))
   order by created_at desc limit 1;
  if not found then
    return jsonb_build_object('order', null, 'proposals', '[]'::jsonb, 'accepted_count', 0, 'quotes', '[]'::jsonb);
  end if;
  return jsonb_build_object(
    'order', public._order_json(v_o),
    'proposals', case when v_o.status = 'searching' then coalesce((
        select jsonb_agg(public._proposal_json(p) order by p.created_at)
        from public.proposals p where p.order_id = v_o.id and p.status = 'available'), '[]'::jsonb) else '[]'::jsonb end,
    'accepted_count', case when v_o.status = 'searching' then public._accepted_count(v_o.id) else 0 end,
    'quotes', public._quotes_json(v_o.id, 2));
end $$;

-- U-08/U-09: chốt thợ – một giao dịch nhất quán (mục 5.2)
create or replace function public.select_mechanic(p_order_id uuid, p_proposal_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_o public.orders; v_p public.proposals; v_m public.mechanics;
  v_accepted_orders uuid[]; r record; v_json jsonb;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  v_o := public._lock_order_for_customer(p_order_id, v_uid);            -- (a)
  if v_o.status <> 'searching' then raise exception 'ORDER_NOT_SEARCHING'; end if;

  select * into v_p from public.proposals where id = p_proposal_id and order_id = p_order_id;  -- (b)
  if not found or v_p.status <> 'available' then raise exception 'PROPOSAL_UNAVAILABLE'; end if;

  select * into v_m from public.mechanics where id = v_p.mechanic_id for update;  -- tuần tự hoá với Offline / chốt khác
  if v_m.account_status = 'locked' then raise exception 'MECHANIC_LOCKED'; end if;   -- (d)
  if v_m.presence <> 'online' then raise exception 'MECHANIC_OFFLINE'; end if;       -- (e)
  if v_m.current_order_id is not null then raise exception 'MECHANIC_BUSY'; end if;  -- (c)

  update public.orders set status = 'selected', mechanic_id = v_m.id, selected_proposal_id = v_p.id, selected_at = now()
   where id = p_order_id;
  update public.mechanics set current_order_id = p_order_id where id = v_m.id;

  -- BR-03: gỡ lượt phân phối + đề xuất còn chờ của thợ ở các yêu cầu KHÁC (không hủy yêu cầu đó)
  select coalesce(array_agg(order_id), '{}') into v_accepted_orders from public.dispatches
   where mechanic_id = v_m.id and order_id <> p_order_id and status = 'accepted';
  update public.dispatches set status = 'removed', updated_at = now()
   where mechanic_id = v_m.id and order_id <> p_order_id and status in ('sent','accepted','proposed');
  for r in
    update public.proposals set status = 'unavailable'
     where mechanic_id = v_m.id and order_id <> p_order_id and status = 'available'
    returning id, order_id, customer_id
  loop
    perform public._emit(r.customer_id, 'MECHANIC_TAKEN',
      jsonb_build_object('order_id', r.order_id, 'mechanic_id', v_m.id, 'proposal_id', r.id));
  end loop;
  for r in select unnest(v_accepted_orders) as oid loop
    perform public._emit_count(r.oid);
  end loop;

  -- Các thợ còn lại của yêu cầu này: gỡ yêu cầu khỏi danh sách sự cố
  for r in
    update public.dispatches set status = 'removed', updated_at = now()
     where order_id = p_order_id and mechanic_id <> v_m.id and status in ('sent','accepted','proposed')
    returning mechanic_id
  loop
    perform public._emit(r.mechanic_id, 'REQUEST_CLOSED', jsonb_build_object('order_id', p_order_id));
  end loop;
  update public.proposals set status = 'unavailable' where order_id = p_order_id and id <> v_p.id and status = 'available';

  select public._order_json(o) into v_json from public.orders o where o.id = p_order_id;
  perform public._emit(v_m.id, 'MECHANIC_SELECTED', jsonb_build_object('order', v_json));
  perform public._emit(v_uid, 'MECHANIC_SELECTED', jsonb_build_object('order', v_json));
  perform public._push(v_m.id, 'mechanic', 'Bạn đã được chọn!', 'Khách đã chọn bạn. Hãy bắt đầu di chuyển ngay.',
    jsonb_build_object('type', 'MECHANIC_SELECTED', 'order_id', p_order_id));
  return v_json;
end $$;

-- Khách hủy (U-06, U-08, U-10, U-12, U-13). Trạng thái 6 không hủy được (ma trận hủy).
create or replace function public.cancel_order_by_customer(p_order_id uuid, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_o public.orders; r record; v_json jsonb;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  v_o := public._lock_order_for_customer(p_order_id, v_uid);
  if v_o.status not in ('searching','selected','traveling','arrived','quote_pending') then raise exception 'CANNOT_CANCEL'; end if;

  update public.orders set status = 'cancelled', cancelled_by = 'customer', cancelled_at = now(),
         cancel_reason = nullif(trim(coalesce(p_reason, '')), '')
   where id = p_order_id;

  if v_o.mechanic_id is not null then
    update public.mechanics set current_order_id = null where id = v_o.mechanic_id and current_order_id = p_order_id;
    perform public._emit(v_o.mechanic_id, 'REQUEST_CANCELLED', jsonb_build_object('order_id', p_order_id, 'was_selected', true));
    perform public._push(v_o.mechanic_id, 'mechanic', 'Khách đã hủy yêu cầu', 'Đơn cứu hộ đã bị khách hủy.',
      jsonb_build_object('type', 'REQUEST_CANCELLED', 'order_id', p_order_id));
    perform public._chat_close(p_order_id);
  end if;

  -- BR-06: báo cho mọi thợ còn liên quan
  for r in
    update public.dispatches set status = 'removed', updated_at = now()
     where order_id = p_order_id and status in ('sent','accepted','proposed') and mechanic_id is distinct from v_o.mechanic_id
    returning mechanic_id
  loop
    perform public._emit(r.mechanic_id, 'REQUEST_CANCELLED', jsonb_build_object('order_id', p_order_id, 'was_selected', false));
  end loop;
  update public.proposals set status = 'unavailable' where order_id = p_order_id and status = 'available';

  select public._order_json(o) into v_json from public.orders o where o.id = p_order_id;
  return v_json;
end $$;

-- U-13: xác nhận phiếu – gắn với phiên bản mới nhất
create or replace function public.confirm_quote(p_order_id uuid, p_version integer) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_o public.orders; v_q public.quotes; v_json jsonb;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  v_o := public._lock_order_for_customer(p_order_id, v_uid);
  if v_o.status <> 'quote_pending' then raise exception 'INVALID_STATE'; end if;
  select * into v_q from public.quotes where order_id = p_order_id and version = p_version for update;
  if not found or v_q.status <> 'sent' or p_version <> v_o.current_quote_version then raise exception 'QUOTE_SUPERSEDED'; end if;

  update public.quotes set status = 'superseded' where order_id = p_order_id and status = 'confirmed';
  update public.quotes set status = 'confirmed', confirmed_at = now() where id = v_q.id;
  update public.orders set status = 'repairing' where id = p_order_id;

  perform public._emit(v_o.mechanic_id, 'QUOTE_CONFIRMED', jsonb_build_object('order_id', p_order_id, 'version', p_version));
  perform public._emit(v_uid, 'QUOTE_CONFIRMED', jsonb_build_object('order_id', p_order_id, 'version', p_version));
  perform public._push(v_o.mechanic_id, 'mechanic', 'Khách đã xác nhận phiếu', 'Bạn có thể tiến hành sửa chữa.',
    jsonb_build_object('type', 'QUOTE_CONFIRMED', 'order_id', p_order_id));
  select public._order_json(o) into v_json from public.orders o where o.id = p_order_id;
  return v_json;
end $$;

-- U-16
create or replace function public.submit_review(p_order_id uuid, p_stars integer, p_comment text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_o public.orders; v_json jsonb;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  v_o := public._lock_order_for_customer(p_order_id, v_uid);
  if v_o.mechanic_id is null or v_o.status not in ('awaiting_payment','completed') then raise exception 'REVIEW_NOT_ALLOWED'; end if;
  if v_o.review_status = 'submitted' then raise exception 'ALREADY_REVIEWED'; end if;
  if p_stars is null or p_stars not between 1 and 5 then raise exception 'INVALID_INPUT'; end if;

  insert into public.reviews (order_id, customer_id, mechanic_id, stars, comment)
  values (p_order_id, v_uid, v_o.mechanic_id, p_stars, nullif(trim(coalesce(p_comment, '')), ''));
  update public.orders set review_status = 'submitted' where id = p_order_id;
  -- BR-17: trung bình cộng các lượt đã gửi
  update public.mechanics m set rating_count = s.c, rating_avg = round(s.a, 2)
    from (select count(*)::int as c, avg(stars)::numeric as a from public.reviews where mechanic_id = v_o.mechanic_id) s
   where m.id = v_o.mechanic_id;
  select public._order_json(o) into v_json from public.orders o where o.id = p_order_id;
  return v_json;
end $$;

create or replace function public.skip_review(p_order_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_o public.orders; v_json jsonb;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  v_o := public._lock_order_for_customer(p_order_id, v_uid);
  if v_o.mechanic_id is null or v_o.status not in ('awaiting_payment','completed') then raise exception 'REVIEW_NOT_ALLOWED'; end if;
  if v_o.review_status = 'none' then
    update public.orders set review_status = 'skipped' where id = p_order_id;
  end if;
  select public._order_json(o) into v_json from public.orders o where o.id = p_order_id;
  return v_json;
end $$;

-- U-19 (BR-10: chỉ khách báo cáo)
create or replace function public.create_report(p_order_id uuid, p_kind text, p_content text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_o public.orders; v_id uuid;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_kind not in ('mechanic','rescue_issue') or coalesce(trim(p_content), '') = '' then raise exception 'INVALID_INPUT'; end if;
  select * into v_o from public.orders where id = p_order_id and customer_id = v_uid;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_o.mechanic_id is null then raise exception 'REPORT_NOT_ALLOWED'; end if;
  insert into public.reports (order_id, customer_id, mechanic_id, kind, content)
  values (p_order_id, v_uid, v_o.mechanic_id, p_kind, trim(p_content)) returning id into v_id;
  perform public._emit_topic('admin', 'REPORT_CREATED', jsonb_build_object('report_id', v_id));
  return v_id;
end $$;

-- U-17
create or replace function public.customer_history(p_limit integer default 20, p_before timestamptz default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
      select o.id, o.status, o.created_at, o.incident_types, o.review_status, o.cancelled_by,
             (select m.full_name from public.mechanics m where m.id = o.mechanic_id) as mechanic_name,
             (o.mechanic_id is not null and o.status in ('awaiting_payment','completed') and o.review_status <> 'submitted') as needs_review
        from public.orders o
       where o.customer_id = v_uid and o.status in ('awaiting_payment','completed','cancelled')
         and (p_before is null or o.created_at < p_before)
       order by o.created_at desc
       limit least(greatest(coalesce(p_limit, 20), 1), 50)) x), '[]'::jsonb);
end $$;

-- U-18 / M-15 / A-05: chi tiết đơn theo trình tự yêu cầu → đề xuất sơ bộ → phiếu hoàn chỉnh
create or replace function public.order_detail(p_order_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_o public.orders;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into v_o from public.orders where id = p_order_id;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_uid is distinct from v_o.customer_id and v_uid is distinct from v_o.mechanic_id and not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;
  return jsonb_build_object(
    'order', public._order_json(v_o),
    'quote', (select public._quote_json(q) from public.quotes q where q.order_id = p_order_id
               order by (q.status = 'confirmed') desc, q.version desc limit 1),
    -- BR-17: đánh giá chỉ trả về cho khách
    'review', case when v_uid = v_o.customer_id then
      (select jsonb_build_object('stars', r.stars, 'comment', r.comment, 'created_at', r.created_at)
         from public.reviews r where r.order_id = p_order_id) end);
end $$;

-- U-10: vị trí gần nhất của thợ đã chốt
create or replace function public.get_mechanic_location(p_order_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_uid uuid := auth.uid(); v_o public.orders;
begin
  select * into v_o from public.orders where id = p_order_id;
  if not found or v_o.customer_id is distinct from v_uid then raise exception 'FORBIDDEN'; end if;
  if v_o.status not in ('selected','traveling','arrived') or v_o.mechanic_id is null then return null; end if;
  return (select jsonb_build_object('lat', st_y(m.location::geometry), 'lng', st_x(m.location::geometry), 'at', m.location_at)
            from public.mechanics m where m.id = v_o.mechanic_id and m.location is not null);
end $$;


-- ======== 0004_rpc_mechanic.sql ========
-- =====================================================================
-- FixGo · 0004 · RPC cho app Thợ + hàm phân phối (chỉ service_role)
-- =====================================================================

create or replace function public.ensure_mechanic() returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare v_uid uuid := auth.uid(); v_u auth.users; v_row public.mechanics;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into v_u from auth.users where id = v_uid;
  insert into public.mechanics (id, email, provider)
  values (v_uid, v_u.email, coalesce(v_u.raw_app_meta_data->>'provider', 'email'))
  on conflict (id) do update set email = excluded.email
  returning * into v_row;
  return public._mechanic_self_json(v_row);
end $$;

-- ───────────── Hồ sơ thợ (M-02, M-16, BR-16) ─────────────
create or replace function public._profile_check(p jsonb) returns void
language plpgsql stable as $$
declare v_bd date;
begin
  if coalesce(trim(p->>'face_photo'), '') = '' then raise exception 'INVALID_PROFILE:face_photo'; end if;
  if coalesce(trim(p->>'full_name'), '') = '' then raise exception 'INVALID_PROFILE:full_name'; end if;
  if regexp_replace(coalesce(p->>'phone', ''), '\s', '', 'g') !~ '^(0|\+84)\d{9,10}$' then raise exception 'INVALID_PROFILE:phone'; end if;
  begin
    v_bd := (p->>'birth_date')::date;
  exception when others then
    raise exception 'INVALID_PROFILE:birth_date';
  end;
  if v_bd is null or v_bd > (current_date - interval '18 years')::date then raise exception 'INVALID_PROFILE:birth_date'; end if;
  if jsonb_typeof(p->'skills') is distinct from 'array' or jsonb_array_length(p->'skills') = 0 then raise exception 'INVALID_PROFILE:skills'; end if;
  if exists (select 1 from jsonb_array_elements_text(p->'skills') s
              where s <> all (array['starter','battery','tires','chain','brakes','engine','maintenance'])) then
    raise exception 'INVALID_PROFILE:skills';
  end if;
  if coalesce(trim(p->>'id_full_name'), '') = '' or trim(p->>'id_full_name') <> upper(trim(p->>'id_full_name')) then
    raise exception 'INVALID_PROFILE:id_full_name';
  end if;
  if coalesce(trim(p->>'id_number'), '') !~ '^\d{12}$' then raise exception 'INVALID_PROFILE:id_number'; end if;
  if coalesce(trim(p->>'id_front'), '') = '' then raise exception 'INVALID_PROFILE:id_front'; end if;
  if coalesce(trim(p->>'id_back'), '') = '' then raise exception 'INVALID_PROFILE:id_back'; end if;
end $$;

create or replace function public._apply_profile(p_id uuid, p jsonb) returns void
language sql security definer set search_path = public as $$
  update public.mechanics set
    face_photo = p->>'face_photo', full_name = p->>'full_name', phone = p->>'phone',
    birth_date = (p->>'birth_date')::date,
    skills = array(select jsonb_array_elements_text(p->'skills')),
    experience = nullif(p->>'experience', ''),
    id_full_name = p->>'id_full_name', id_number = p->>'id_number',
    id_front = p->>'id_front', id_back = p->>'id_back'
  where id = p_id;
$$;

create or replace function public.submit_mechanic_profile(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_m public.mechanics; v_norm jsonb;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into v_m from public.mechanics where id = v_uid for update;
  if not found then raise exception 'FORBIDDEN'; end if;
  perform public._profile_check(p_payload);
  v_norm := jsonb_build_object(
    'face_photo', p_payload->>'face_photo',
    'full_name', trim(p_payload->>'full_name'),
    'phone', regexp_replace(p_payload->>'phone', '\s', '', 'g'),
    'birth_date', p_payload->>'birth_date',
    'skills', p_payload->'skills',
    'experience', nullif(trim(coalesce(p_payload->>'experience', '')), ''),
    'id_full_name', trim(p_payload->>'id_full_name'),
    'id_number', trim(p_payload->>'id_number'),
    'id_front', p_payload->>'id_front',
    'id_back', p_payload->>'id_back');

  if v_m.profile_status = 'approved' then
    -- BR-16: thay đổi chưa duyệt chưa có hiệu lực; thông tin đã duyệt vẫn được áp dụng
    update public.mechanics set pending_changes = v_norm, pending_changes_at = now() where id = v_uid;
  else
    perform public._apply_profile(v_uid, v_norm);
    update public.mechanics set profile_status = 'pending', submitted_at = now(), review_note = null where id = v_uid;
  end if;
  perform public._emit_topic('admin', 'PROFILE_SUBMITTED', jsonb_build_object('mechanic_id', v_uid));
  select * into v_m from public.mechanics where id = v_uid;
  return public._mechanic_self_json(v_m);
end $$;

-- ───────────── Trạng thái, lịch sử ─────────────
create or replace function public.mechanic_state() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_m public.mechanics; v_o public.orders;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into v_m from public.mechanics where id = v_uid;
  if not found then raise exception 'FORBIDDEN'; end if;
  if v_m.current_order_id is not null then
    select * into v_o from public.orders where id = v_m.current_order_id;
  end if;
  return jsonb_build_object(
    'mechanic', public._mechanic_self_json(v_m),
    'dispatches', case when v_m.profile_status = 'approved' and v_m.current_order_id is null then coalesce((
        select jsonb_agg(public._dispatch_json(d) order by d.created_at desc)
          from public.dispatches d join public.orders o on o.id = d.order_id
         where d.mechanic_id = v_uid and d.status in ('sent','accepted') and o.status = 'searching'), '[]'::jsonb)
      else '[]'::jsonb end,
    'order', case when v_m.current_order_id is not null then public._order_json(v_o) end,
    'quotes', case when v_m.current_order_id is not null then public._quotes_json(v_o.id, 2) else '[]'::jsonb end);
end $$;

create or replace function public.mechanic_history(p_limit integer default 20, p_before timestamptz default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
      select o.id, o.status, o.created_at, o.incident_types, o.cancelled_by,
             (select c.full_name from public.customers c where c.id = o.customer_id) as customer_name
        from public.orders o
       where o.mechanic_id = v_uid and o.status in ('completed','cancelled')
         and (p_before is null or o.created_at < p_before)
       order by o.created_at desc
       limit least(greatest(coalesce(p_limit, 20), 1), 50)) x), '[]'::jsonb);
end $$;

-- ───────────── Online / vị trí (M-04, BR-14) ─────────────
create or replace function public.set_presence(p_online boolean, p_lat double precision default null, p_lng double precision default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_uid uuid := auth.uid(); v_m public.mechanics; r record;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into v_m from public.mechanics where id = v_uid for update;
  if not found then raise exception 'FORBIDDEN'; end if;

  if p_online then
    if v_m.profile_status <> 'approved' then raise exception 'NOT_APPROVED'; end if;
    if v_m.account_status = 'locked' then raise exception 'ACCOUNT_LOCKED'; end if;
    if p_lat is null or p_lng is null then raise exception 'LOCATION_REQUIRED'; end if;
    update public.mechanics set presence = 'online',
           location = extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography,
           location_at = now()
     where id = v_uid;
  else
    update public.mechanics set presence = 'offline' where id = v_uid;
    -- Các đề xuất sơ bộ còn chờ khách chọn không còn khả dụng; khách liên quan gỡ thợ khỏi danh sách.
    for r in
      update public.proposals p set status = 'unavailable'
       where p.mechanic_id = v_uid and p.status = 'available'
         and exists (select 1 from public.orders o where o.id = p.order_id and o.status = 'searching')
      returning p.id, p.order_id, p.customer_id
    loop
      perform public._emit(r.customer_id, 'MECHANIC_OFFLINE',
        jsonb_build_object('order_id', r.order_id, 'mechanic_id', v_uid, 'proposal_id', r.id));
    end loop;
  end if;
  return jsonb_build_object('presence', case when p_online then 'online' else 'offline' end);
end $$;

create or replace function public.update_location(p_lat double precision, p_lng double precision) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  update public.mechanics
     set location = extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography, location_at = now()
   where id = v_uid and (presence = 'online' or current_order_id is not null);
end $$;

-- Ghi nhật ký vị trí theo lô (BR-11) – app gom điểm và gửi ~30 giây/lần để tiết kiệm request.
create or replace function public.log_locations(p_order_id uuid, p_points jsonb) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_uid uuid := auth.uid(); v_o public.orders; v_last record;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into v_o from public.orders where id = p_order_id;
  if not found or v_o.mechanic_id is distinct from v_uid then raise exception 'FORBIDDEN'; end if;
  if v_o.status not in ('selected','traveling','arrived') or jsonb_typeof(p_points) <> 'array' then return; end if;
  insert into public.location_logs (order_id, mechanic_id, lat, lng, recorded_at)
  select p_order_id, v_uid, (x->>'lat')::float8, (x->>'lng')::float8,
         coalesce(to_timestamp((x->>'t')::float8 / 1000.0), now())
    from (select x from jsonb_array_elements(p_points) x limit 200) q(x);
  select (x->>'lat')::float8 as lat, (x->>'lng')::float8 as lng into v_last
    from jsonb_array_elements(p_points) with ordinality t(x, ord) order by ord desc limit 1;
  if v_last.lat is not null then
    update public.mechanics
       set location = extensions.st_setsrid(extensions.st_makepoint(v_last.lng, v_last.lat), 4326)::extensions.geography, location_at = now()
     where id = v_uid;
  end if;
end $$;

-- ───────────── Nhận yêu cầu & gửi đề xuất sơ bộ (M-04 … M-07) ─────────────
create or replace function public._assert_dispatchable(p_uid uuid) returns public.mechanics
language plpgsql security definer set search_path = public as $$
declare v_m public.mechanics;
begin
  select * into v_m from public.mechanics where id = p_uid;
  if not found or v_m.profile_status <> 'approved' then raise exception 'NOT_APPROVED'; end if;
  if v_m.account_status = 'locked' then raise exception 'ACCOUNT_LOCKED'; end if;
  return v_m;
end $$;

create or replace function public.accept_dispatch(p_order_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_d public.dispatches; v_status text;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  perform public._assert_dispatchable(v_uid);
  select * into v_d from public.dispatches where order_id = p_order_id and mechanic_id = v_uid for update;
  if not found or v_d.status in ('removed','declined') then raise exception 'REQUEST_UNAVAILABLE'; end if;
  if not exists (select 1 from public.orders where id = p_order_id and status = 'searching') then raise exception 'REQUEST_UNAVAILABLE'; end if;
  if v_d.status = 'sent' then   -- chỉ ghi nhận một lần; mở lại M-07 không tăng số
    update public.dispatches set status = 'accepted', updated_at = now() where id = v_d.id;
    perform public._emit_count(p_order_id);
  end if;
  select status into v_status from public.dispatches where id = v_d.id;
  return jsonb_build_object('status', v_status);
end $$;

create or replace function public.decline_dispatch(p_order_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_d public.dispatches;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into v_d from public.dispatches where order_id = p_order_id and mechanic_id = v_uid for update;
  if not found or v_d.status not in ('sent','accepted') then raise exception 'REQUEST_UNAVAILABLE'; end if;
  update public.dispatches set status = 'declined', draft = null, updated_at = now() where id = v_d.id;
  if v_d.status = 'accepted' then perform public._emit_count(p_order_id); end if;
end $$;

create or replace function public.save_dispatch_draft(p_order_id uuid, p_draft jsonb) returns void
language sql security definer set search_path = public as $$
  update public.dispatches set draft = p_draft, updated_at = now()
   where order_id = p_order_id and mechanic_id = auth.uid() and status in ('sent','accepted');
$$;

create or replace function public.submit_proposal(
  p_order_id uuid, p_assessment text, p_price_min integer, p_price_max integer, p_eta_minutes integer
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_m public.mechanics; v_d public.dispatches; v_o public.orders; v_p public.proposals; v_json jsonb;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if coalesce(trim(p_assessment), '') = '' or p_price_min is null or p_price_max is null or p_price_min < 0
     or p_price_max < p_price_min or p_eta_minutes is null or p_eta_minutes <= 0 then raise exception 'INVALID_INPUT'; end if;

  -- Thứ tự khoá thống nhất: ĐƠN → THỢ → lượt phân phối (cùng thứ tự với select_mechanic, tránh deadlock)
  select * into v_o from public.orders where id = p_order_id for share;
  if not found or v_o.status <> 'searching' then raise exception 'REQUEST_UNAVAILABLE'; end if;
  select * into v_m from public.mechanics where id = v_uid for share;   -- tuần tự hoá với set_presence(false)
  if not found or v_m.profile_status <> 'approved' then raise exception 'NOT_APPROVED'; end if;
  if v_m.account_status = 'locked' then raise exception 'ACCOUNT_LOCKED'; end if;
  if v_m.presence <> 'online' then raise exception 'MECHANIC_OFFLINE'; end if;      -- chỉ gửi khi Online

  select * into v_d from public.dispatches where order_id = p_order_id and mechanic_id = v_uid for update;
  if not found or v_d.status in ('removed','declined','proposed') then raise exception 'REQUEST_UNAVAILABLE'; end if;
  if v_d.status = 'sent' then raise exception 'NOT_ACCEPTED'; end if;

  insert into public.proposals (order_id, mechanic_id, customer_id, assessment, price_min, price_max, eta_minutes)
  values (p_order_id, v_uid, v_o.customer_id, trim(p_assessment), p_price_min, p_price_max, p_eta_minutes)
  returning * into v_p;
  update public.dispatches set status = 'proposed', draft = null, updated_at = now() where id = v_d.id;

  v_json := public._proposal_json(v_p);
  perform public._emit(v_o.customer_id, 'PROPOSAL_NEW', jsonb_build_object('order_id', p_order_id, 'proposal', v_json));
  perform public._emit_count(p_order_id);
  perform public._push(v_o.customer_id, 'customer', 'Có thợ gửi đề xuất',
    coalesce(v_m.full_name, 'Một thợ') || ' đã gửi đề xuất cho yêu cầu của bạn.',
    jsonb_build_object('type', 'PROPOSAL_NEW', 'order_id', p_order_id));
  return v_json;
end $$;

-- ───────────── Xử lý đơn đã chốt (M-08 … M-13) ─────────────
create or replace function public.start_travel(p_order_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_o public.orders; v_json jsonb;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  v_o := public._lock_order_for_mechanic(p_order_id, v_uid);
  if v_o.status = 'selected' then
    update public.orders set status = 'traveling' where id = p_order_id;
    perform public._emit(v_o.customer_id, 'TRAVEL_STARTED', jsonb_build_object('order_id', p_order_id));
  elsif v_o.status <> 'traveling' then
    raise exception 'INVALID_STATE';
  end if;
  select public._order_json(o) into v_json from public.orders o where o.id = p_order_id;
  return v_json;
end $$;

create or replace function public.mark_arrived(p_order_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_o public.orders; v_json jsonb;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  v_o := public._lock_order_for_mechanic(p_order_id, v_uid);
  if v_o.status = 'traveling' then
    update public.orders set status = 'arrived', arrived_at = now() where id = p_order_id;
    perform public._emit(v_o.customer_id, 'MECHANIC_ARRIVED', jsonb_build_object('order_id', p_order_id));
    perform public._push(v_o.customer_id, 'customer', 'Thợ đã đến nơi', 'Thợ đang kiểm tra xe và lập phiếu đề xuất.',
      jsonb_build_object('type', 'MECHANIC_ARRIVED', 'order_id', p_order_id));
  elsif v_o.status <> 'arrived' then
    raise exception 'INVALID_STATE';
  end if;
  select public._order_json(o) into v_json from public.orders o where o.id = p_order_id;
  return v_json;
end $$;

create or replace function public.cancel_order_by_mechanic(p_order_id uuid, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_o public.orders; v_json jsonb;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  v_o := public._lock_order_for_mechanic(p_order_id, v_uid);
  if v_o.status not in ('traveling','arrived','quote_pending','repairing') then raise exception 'CANNOT_CANCEL'; end if;
  update public.orders set status = 'cancelled', cancelled_by = 'mechanic', cancelled_at = now(),
         cancel_reason = nullif(trim(coalesce(p_reason, '')), '')
   where id = p_order_id;
  update public.mechanics set current_order_id = null where id = v_uid and current_order_id = p_order_id;
  perform public._emit(v_o.customer_id, 'ORDER_CANCELLED_BY_MECHANIC', jsonb_build_object('order_id', p_order_id));
  perform public._push(v_o.customer_id, 'customer', 'Thợ đã hủy đơn', 'Rất tiếc, thợ không thể tiếp tục. Bạn có thể tạo yêu cầu mới.',
    jsonb_build_object('type', 'ORDER_CANCELLED_BY_MECHANIC', 'order_id', p_order_id));
  perform public._chat_close(p_order_id);
  select public._order_json(o) into v_json from public.orders o where o.id = p_order_id;
  return v_json;
end $$;

-- M-11: gửi / gửi lại phiếu (mỗi lần tạo một phiên bản mới, BR-07)
create or replace function public.submit_quote(p_order_id uuid, p_diagnosis text, p_lines jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_o public.orders; v_ver integer; v_new public.quotes; v_total bigint;
  v_json jsonb; v_prev jsonb; v_ok boolean; v_cnt integer; v_tasks integer; v_distinct integer;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  v_o := public._lock_order_for_mechanic(p_order_id, v_uid);
  if v_o.status not in ('arrived','quote_pending','repairing') then raise exception 'INVALID_STATE'; end if;
  if coalesce(trim(p_diagnosis), '') = '' or p_lines is null or jsonb_typeof(p_lines) <> 'array' then raise exception 'INVALID_QUOTE'; end if;

  begin
    select bool_and(coalesce(
             (e->>'line_key') is not null and (e->>'line_key')::uuid is not null
             and e->>'kind' in ('task','part')
             and coalesce(trim(e->>'name'), '') <> ''
             and (e->>'unit_price')::bigint >= 0
             and (e->>'kind' = 'task' or coalesce((e->>'quantity')::integer, 0) >= 1), false)),
           count(*), count(*) filter (where e->>'kind' = 'task'), count(distinct e->>'line_key')
      into v_ok, v_cnt, v_tasks, v_distinct
      from jsonb_array_elements(p_lines) e;
  exception when others then
    raise exception 'INVALID_QUOTE';
  end;
  if v_ok is not true or v_tasks < 1 or v_distinct <> v_cnt then raise exception 'INVALID_QUOTE'; end if;

  v_ver := v_o.current_quote_version + 1;
  update public.quotes set status = 'superseded' where order_id = p_order_id and status = 'sent';
  insert into public.quotes (order_id, version, diagnosis, status, total)
  values (p_order_id, v_ver, trim(p_diagnosis), 'sent', 0) returning * into v_new;

  insert into public.quote_lines (quote_id, line_key, kind, name, quantity, unit_price, amount, sort)
  select v_new.id, (t.e->>'line_key')::uuid, t.e->>'kind', trim(t.e->>'name'),
         case when t.e->>'kind' = 'task' then 1 else (t.e->>'quantity')::integer end,
         (t.e->>'unit_price')::bigint,
         (case when t.e->>'kind' = 'task' then 1 else (t.e->>'quantity')::integer end)::bigint * (t.e->>'unit_price')::bigint,
         t.ord::integer
    from jsonb_array_elements(p_lines) with ordinality as t(e, ord);
  select coalesce(sum(amount), 0) into v_total from public.quote_lines where quote_id = v_new.id;
  update public.quotes set total = v_total where id = v_new.id;
  update public.orders set status = 'quote_pending', current_quote_version = v_ver where id = p_order_id;

  select public._quote_json(q) into v_json from public.quotes q where q.id = v_new.id;
  select public._quote_json(q) into v_prev from public.quotes q where q.order_id = p_order_id and q.version = v_ver - 1;
  perform public._emit(v_o.customer_id, 'QUOTE_SUBMITTED', jsonb_build_object('order_id', p_order_id, 'quote', v_json, 'previous', v_prev));
  perform public._push(v_o.customer_id, 'customer',
    case when v_ver > 1 then 'Thợ gửi lại phiếu đề xuất' else 'Thợ đã gửi phiếu đề xuất' end,
    'Vui lòng kiểm tra và xác nhận phiếu.', jsonb_build_object('type', 'QUOTE_SUBMITTED', 'order_id', p_order_id));
  return jsonb_build_object('quote', v_json, 'previous', v_prev);
end $$;

create or replace function public.complete_repair(p_order_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_o public.orders; v_json jsonb;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  v_o := public._lock_order_for_mechanic(p_order_id, v_uid);
  if v_o.status <> 'repairing' then raise exception 'INVALID_STATE'; end if;
  update public.orders set status = 'awaiting_payment', repair_completed_at = now() where id = p_order_id;
  perform public._emit(v_o.customer_id, 'REPAIR_COMPLETED', jsonb_build_object('order_id', p_order_id));
  perform public._emit(v_uid, 'REPAIR_COMPLETED', jsonb_build_object('order_id', p_order_id));
  perform public._push(v_o.customer_id, 'customer', 'Sửa chữa hoàn tất', 'Hãy thanh toán cho thợ và đánh giá dịch vụ.',
    jsonb_build_object('type', 'REPAIR_COMPLETED', 'order_id', p_order_id));
  perform public._chat_close(p_order_id);   -- BR-15: kết thúc nhắn tin
  select public._order_json(o) into v_json from public.orders o where o.id = p_order_id;
  return v_json;
end $$;

create or replace function public.confirm_payment(p_order_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_o public.orders; v_json jsonb;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  v_o := public._lock_order_for_mechanic(p_order_id, v_uid);
  if v_o.status = 'completed' then
    select public._order_json(o) into v_json from public.orders o where o.id = p_order_id;
    return v_json;
  end if;
  if v_o.status <> 'awaiting_payment' then raise exception 'INVALID_STATE'; end if;
  update public.orders set status = 'completed', completed_at = now() where id = p_order_id;
  update public.mechanics set current_order_id = null, completed_count = completed_count + 1 where id = v_uid;
  perform public._emit(v_o.customer_id, 'PAYMENT_CONFIRMED', jsonb_build_object('order_id', p_order_id));
  select public._order_json(o) into v_json from public.orders o where o.id = p_order_id;
  return v_json;
end $$;

-- ───────────── Phân phối (chỉ service_role – Edge Function create-request) ─────────────
create or replace function public.get_dispatch_candidates(p_order_id uuid, p_radius_m integer default 5000, p_limit integer default 96)
returns table (mechanic_id uuid, lat double precision, lng double precision, straight_m double precision)
language sql stable security definer set search_path = public, extensions as $$
  select m.id, st_y(m.location::geometry), st_x(m.location::geometry), st_distance(m.location, o.location)
    from public.orders o, public.mechanics m
   where o.id = p_order_id and o.status = 'searching'
     and m.profile_status = 'approved' and m.account_status = 'active' and m.presence = 'online'
     and m.current_order_id is null
     and m.location is not null and m.location_at > now() - interval '30 minutes'
     and st_dwithin(m.location, o.location, p_radius_m)
   order by st_distance(m.location, o.location)
   limit p_limit;
$$;

-- BR-14: phát đúng MỘT lần – dispatched_at chỉ được đặt một lần.
create or replace function public.dispatch_insert(p_order_id uuid, p_items jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare v_o public.orders; r record; n integer := 0;
begin
  update public.orders set dispatched_at = now()
   where id = p_order_id and dispatched_at is null and status = 'searching'
  returning * into v_o;
  if not found then raise exception 'DISPATCH_SKIPPED'; end if;
  for r in
    insert into public.dispatches (order_id, mechanic_id, customer_id, route_distance_m)
    select p_order_id, m.id, v_o.customer_id, greatest(0, (i->>'route_m')::integer)
      from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) i
      join public.mechanics m on m.id = (i->>'mechanic_id')::uuid
       and m.profile_status = 'approved' and m.account_status = 'active' and m.presence = 'online' and m.current_order_id is null
    on conflict (order_id, mechanic_id) do nothing
    returning id, mechanic_id
  loop
    n := n + 1;
    perform public._emit(r.mechanic_id, 'REQUEST_NEW',
      jsonb_build_object('dispatch', (select public._dispatch_json(d) from public.dispatches d where d.id = r.id)));
    perform public._push(r.mechanic_id, 'mechanic', 'Có sự cố mới gần bạn', 'Nhấn để xem chi tiết yêu cầu cứu hộ.',
      jsonb_build_object('type', 'REQUEST_NEW', 'order_id', p_order_id));
  end loop;
  return n;
end $$;


-- ======== 0005_rpc_admin.sql ========
-- =====================================================================
-- FixGo · 0005 · RPC cho hệ thống quản trị (A-02 … A-07)
-- =====================================================================

create or replace function public._require_admin() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'FORBIDDEN'; end if;
end $$;

-- A-03: duyệt / từ chối hồ sơ đăng ký mới hoặc thay đổi hồ sơ (BR-16)
create or replace function public.admin_review_profile(p_mechanic_id uuid, p_approve boolean, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_m public.mechanics; v_kind text; v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  perform public._require_admin();
  select * into v_m from public.mechanics where id = p_mechanic_id for update;
  if not found then raise exception 'FORBIDDEN'; end if;

  if v_m.profile_status = 'approved' and v_m.pending_changes is not null then
    v_kind := 'change';
    if p_approve then
      perform public._apply_profile(p_mechanic_id, v_m.pending_changes);
      update public.mechanics set pending_changes = null, pending_changes_at = null, review_note = null, reviewed_at = now() where id = p_mechanic_id;
    else   -- giữ nguyên thông tin cũ
      update public.mechanics set pending_changes = null, pending_changes_at = null, review_note = v_reason, reviewed_at = now() where id = p_mechanic_id;
    end if;
  elsif v_m.profile_status = 'pending' then
    v_kind := 'registration';
    update public.mechanics
       set profile_status = case when p_approve then 'approved' else 'rejected' end,
           review_note = case when p_approve then null else v_reason end, reviewed_at = now()
     where id = p_mechanic_id;
  else
    raise exception 'INVALID_STATE';
  end if;

  perform public._emit(p_mechanic_id, 'PROFILE_REVIEWED', jsonb_build_object('approved', p_approve, 'kind', v_kind, 'reason', v_reason));
  perform public._push(p_mechanic_id, 'mechanic',
    case when p_approve then 'Hồ sơ đã được duyệt' else 'Hồ sơ bị từ chối' end,
    case when p_approve then 'Bạn có thể bật Online để nhận yêu cầu cứu hộ.' else coalesce(v_reason, 'Vui lòng chỉnh sửa và gửi lại hồ sơ.') end,
    jsonb_build_object('type', 'PROFILE_REVIEWED'));
  return jsonb_build_object('mechanic_id', p_mechanic_id, 'kind', v_kind, 'approved', p_approve);
end $$;

-- A-04: khóa / mở khóa tài khoản thợ
create or replace function public.admin_set_lock(p_mechanic_id uuid, p_locked boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_m public.mechanics; r record; v_accepted_orders uuid[];
begin
  perform public._require_admin();
  select * into v_m from public.mechanics where id = p_mechanic_id for update;
  if not found then raise exception 'FORBIDDEN'; end if;

  if p_locked then
    update public.mechanics set account_status = 'locked', presence = 'offline' where id = p_mechanic_id;
    -- Gỡ đề xuất đang chờ + lượt phân phối đang xử lý dở. Không hủy yêu cầu của khách, không ảnh hưởng đơn đã chốt.
    for r in
      update public.proposals p set status = 'unavailable'
       where p.mechanic_id = p_mechanic_id and p.status = 'available'
         and exists (select 1 from public.orders o where o.id = p.order_id and o.status = 'searching')
      returning p.id, p.order_id, p.customer_id
    loop
      perform public._emit(r.customer_id, 'ACCOUNT_LOCKED',
        jsonb_build_object('order_id', r.order_id, 'mechanic_id', p_mechanic_id, 'proposal_id', r.id));
    end loop;
    select coalesce(array_agg(d.order_id), '{}') into v_accepted_orders from public.dispatches d
      join public.orders o on o.id = d.order_id
     where d.mechanic_id = p_mechanic_id and d.status = 'accepted' and o.status = 'searching';
    update public.dispatches d set status = 'removed', updated_at = now()
     where d.mechanic_id = p_mechanic_id and d.status in ('sent','accepted','proposed')
       and exists (select 1 from public.orders o where o.id = d.order_id and o.status = 'searching');
    for r in select unnest(v_accepted_orders) as oid loop
      perform public._emit_count(r.oid);
    end loop;
    perform public._emit(p_mechanic_id, 'ACCOUNT_LOCKED', jsonb_build_object('locked', true));
    perform public._push(p_mechanic_id, 'mechanic', 'Tài khoản bị khóa', 'Tài khoản của bạn đã bị quản trị viên khóa.', jsonb_build_object('type', 'ACCOUNT_LOCKED'));
  else
    update public.mechanics set account_status = 'active' where id = p_mechanic_id;
    perform public._emit(p_mechanic_id, 'ACCOUNT_UNLOCKED', jsonb_build_object('locked', false));
  end if;
  return jsonb_build_object('mechanic_id', p_mechanic_id, 'locked', p_locked);
end $$;

-- A-07: ghi nhận kết quả xử lý khiếu nại
create or replace function public.admin_resolve_report(p_report_id uuid, p_resolution text, p_lock_mechanic boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_r public.reports;
begin
  perform public._require_admin();
  if coalesce(trim(p_resolution), '') = '' then raise exception 'INVALID_INPUT'; end if;
  update public.reports set status = 'resolved', resolution = trim(p_resolution), resolved_by = auth.uid(), resolved_at = now()
   where id = p_report_id returning * into v_r;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if p_lock_mechanic and v_r.mechanic_id is not null then
    perform public.admin_set_lock(v_r.mechanic_id, true);
  end if;
  return jsonb_build_object('report_id', v_r.id, 'status', v_r.status);
end $$;

-- A-05 / A-07: nhật ký đơn – chat, các phiên bản phiếu, vị trí, thay đổi trạng thái
create or replace function public.admin_order_log(p_order_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_o public.orders;
begin
  perform public._require_admin();
  select * into v_o from public.orders where id = p_order_id;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  return jsonb_build_object(
    'order', public._order_json(v_o),
    'customer', (select jsonb_build_object('id', c.id, 'full_name', c.full_name, 'email', c.email) from public.customers c where c.id = v_o.customer_id),
    'mechanic', (select jsonb_build_object('id', m.id, 'full_name', m.full_name, 'phone', m.phone) from public.mechanics m where m.id = v_o.mechanic_id),
    'proposals', coalesce((select jsonb_agg(public._proposal_json(p) order by p.created_at) from public.proposals p where p.order_id = p_order_id), '[]'::jsonb),
    'quotes', coalesce((select jsonb_agg(public._quote_json(q) order by q.version) from public.quotes q where q.order_id = p_order_id), '[]'::jsonb),
    'messages', coalesce((select jsonb_agg(jsonb_build_object('sender_role', c.sender_role, 'content', c.content, 'created_at', c.created_at) order by c.created_at)
                            from public.chat_messages c where c.order_id = p_order_id), '[]'::jsonb),
    'locations', coalesce((select jsonb_agg(jsonb_build_object('lat', l.lat, 'lng', l.lng, 'at', l.recorded_at) order by l.recorded_at)
                             from (select * from public.location_logs where order_id = p_order_id order by recorded_at limit 1000) l), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object('from', e.from_status, 'to', e.to_status, 'actor', e.actor, 'at', e.created_at) order by e.created_at)
                          from public.order_events e where e.order_id = p_order_id), '[]'::jsonb));
end $$;


-- ======== 0006_security.sql ========
-- =====================================================================
-- FixGo · 0006 · Bảo mật: RLS, quyền gọi hàm, Storage, Realtime Authorization
-- Nguyên tắc: bảng chỉ cho ĐỌC (theo RLS); mọi thao tác ghi đi qua RPC SECURITY DEFINER.
-- =====================================================================

alter table public.admins enable row level security;
alter table public.customers enable row level security;
alter table public.mechanics enable row level security;
alter table public.orders enable row level security;
alter table public.dispatches enable row level security;
alter table public.proposals enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_lines enable row level security;
alter table public.chat_messages enable row level security;
alter table public.reviews enable row level security;
alter table public.reports enable row level security;
alter table public.location_logs enable row level security;
alter table public.order_events enable row level security;
alter table public.outbox enable row level security;

create policy admins_self on public.admins for select to authenticated using (id = auth.uid());

create policy customers_select on public.customers for select to authenticated using (id = auth.uid() or public.is_admin());
-- Thợ xem hồ sơ của chính mình (gồm CCCD); khách KHÔNG đọc được bảng này (xem thợ qua RPC); admin xem tất cả.
create policy mechanics_select on public.mechanics for select to authenticated using (id = auth.uid() or public.is_admin());

create policy orders_select on public.orders for select to authenticated
  using (customer_id = auth.uid() or mechanic_id = auth.uid() or public.is_admin());
create policy dispatches_select on public.dispatches for select to authenticated using (mechanic_id = auth.uid() or public.is_admin());
create policy proposals_select on public.proposals for select to authenticated using (customer_id = auth.uid() or public.is_admin());

create policy quotes_select on public.quotes for select to authenticated using (
  public.is_admin() or exists (select 1 from public.orders o where o.id = quotes.order_id and (o.customer_id = auth.uid() or o.mechanic_id = auth.uid())));
create policy quote_lines_select on public.quote_lines for select to authenticated using (
  public.is_admin() or exists (select 1 from public.quotes q join public.orders o on o.id = q.order_id
                                where q.id = quote_lines.quote_id and (o.customer_id = auth.uid() or o.mechanic_id = auth.uid())));

-- Nhật ký chat / vị trí / trạng thái: chỉ admin
create policy chat_messages_admin on public.chat_messages for select to authenticated using (public.is_admin());
create policy location_logs_admin on public.location_logs for select to authenticated using (public.is_admin());
create policy order_events_admin on public.order_events for select to authenticated using (public.is_admin());
-- BR-17: thợ không đọc được đánh giá
create policy reviews_select on public.reviews for select to authenticated using (customer_id = auth.uid() or public.is_admin());
create policy reports_select on public.reports for select to authenticated using (customer_id = auth.uid() or public.is_admin());
-- outbox: không có policy ⇒ chỉ service_role truy cập

grant usage on schema public to anon, authenticated, service_role;
-- Không cho ghi trực tiếp: gỡ mọi quyền ghi mặc định mà Supabase cấp cho anon/authenticated
revoke all on all tables in schema public from anon;
revoke insert, update, delete, truncate, references, trigger on all tables in schema public from authenticated;
grant select on all tables in schema public to authenticated;
revoke all on public.outbox, public.chat_messages, public.location_logs, public.order_events from anon, authenticated;
grant select on public.chat_messages, public.location_logs, public.order_events to authenticated;  -- RLS giới hạn cho admin
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- ───────────── Quyền gọi hàm ─────────────
do $$
declare r record;
begin
  -- Hàm nội bộ (tên bắt đầu bằng "_") không ai gọi được ngoài các hàm SECURITY DEFINER
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like '\_%' loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
  end loop;
end $$;

grant execute on function
  public.is_admin(),
  public.ensure_customer(text), public.update_customer_name(text), public.register_push_token(text, text),
  public.create_rescue_request(double precision, double precision, text, text[], text, text, text, jsonb),
  public.customer_state(), public.select_mechanic(uuid, uuid), public.cancel_order_by_customer(uuid, text),
  public.confirm_quote(uuid, integer), public.submit_review(uuid, integer, text), public.skip_review(uuid),
  public.create_report(uuid, text, text), public.customer_history(integer, timestamptz),
  public.order_detail(uuid), public.get_mechanic_location(uuid),
  public.ensure_mechanic(), public.submit_mechanic_profile(jsonb), public.mechanic_state(),
  public.mechanic_history(integer, timestamptz),
  public.set_presence(boolean, double precision, double precision), public.update_location(double precision, double precision),
  public.log_locations(uuid, jsonb), public.accept_dispatch(uuid), public.decline_dispatch(uuid),
  public.save_dispatch_draft(uuid, jsonb), public.submit_proposal(uuid, text, integer, integer, integer),
  public.start_travel(uuid), public.mark_arrived(uuid), public.cancel_order_by_mechanic(uuid, text),
  public.submit_quote(uuid, text, jsonb), public.complete_repair(uuid), public.confirm_payment(uuid),
  public.admin_review_profile(uuid, boolean, text), public.admin_set_lock(uuid, boolean),
  public.admin_resolve_report(uuid, text, boolean), public.admin_order_log(uuid)
to authenticated;

-- Chỉ Edge Function (service_role) được phân phối yêu cầu
revoke all on function public.get_dispatch_candidates(uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.dispatch_insert(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.get_dispatch_candidates(uuid, integer, integer) to service_role;
grant execute on function public.dispatch_insert(uuid, jsonb) to service_role;

-- ───────────── Realtime Authorization (kênh riêng tư) ─────────────
create or replace function public.can_access_order_topic(p_topic text, p_mechanic_only boolean default false) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_topic is null or p_topic !~ '^order:[0-9a-fA-F-]{36}$' then return false; end if;
  v_id := substr(p_topic, 7)::uuid;
  return exists (select 1 from public.orders o where o.id = v_id and (
    o.mechanic_id = auth.uid() or (not p_mechanic_only and o.customer_id = auth.uid())));
end $$;
grant execute on function public.can_access_order_topic(text, boolean) to authenticated;

drop policy if exists fixgo_realtime_receive on realtime.messages;
drop policy if exists fixgo_realtime_send on realtime.messages;
create policy fixgo_realtime_receive on realtime.messages for select to authenticated using (
  extension = 'broadcast' and (
    (select realtime.topic()) = 'user:' || (select auth.uid())::text
    or public.can_access_order_topic((select realtime.topic()), false)
    or ((select realtime.topic()) = 'admin' and public.is_admin())));
create policy fixgo_realtime_send on realtime.messages for insert to authenticated with check (
  extension = 'broadcast' and public.can_access_order_topic((select realtime.topic()), true));

-- ───────────── Storage ─────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('faces', 'faces', true, 5242880, array['image/jpeg','image/png','image/webp']),
  ('request-media', 'request-media', true, 52428800, array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime']),
  ('cccd', 'cccd', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists fixgo_storage_upload on storage.objects;
drop policy if exists fixgo_cccd_read on storage.objects;
create policy fixgo_storage_upload on storage.objects for insert to authenticated
  with check (bucket_id in ('faces','request-media','cccd') and (storage.foldername(name))[1] = auth.uid()::text);
-- CCCD chỉ admin và chính thợ đó được xem
create policy fixgo_cccd_read on storage.objects for select to authenticated
  using (bucket_id = 'cccd' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
