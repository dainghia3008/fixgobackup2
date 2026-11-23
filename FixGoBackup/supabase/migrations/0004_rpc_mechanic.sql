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
