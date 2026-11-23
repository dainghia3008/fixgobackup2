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
