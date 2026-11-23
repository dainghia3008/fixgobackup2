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
