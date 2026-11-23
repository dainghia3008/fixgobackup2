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
