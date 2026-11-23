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
