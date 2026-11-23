import React, { useEffect, useRef, useState } from 'react';
import { AppState, FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StreamChat, type Channel, type MessageResponse } from 'stream-chat';
import { create } from 'zustand';
import { ENV } from './env';
import { callFunction } from './supabase';
import { Button, Screen, Spinner, toast } from './ui';
import { colors, font, radius } from './theme';
import { chatUserId, resolveChatSender, type ChatRole } from '../core/chatIdentity';

// ───────────── Quản lý kết nối Stream (1 WebSocket, chỉ khi đơn đã chốt thợ) ─────────────
let client: StreamChat | null = null;
let current: { userId: string; orderId: string; channel: Channel; off: () => void } | null = null;
let chatScreenOpen = false;
// Mở lại màn hình/đổi tài khoản có thể xảy ra khi kết nối trước chưa xong.
let pending: Promise<unknown> = Promise.resolve();
function enqueue<T>(work: () => Promise<T>): Promise<T> {
  const result = pending.then(work);
  pending = result.catch(() => {});
  return result;
}

export const useChatUnread = create<{ count: number; inc: () => void; reset: () => void }>((set) => ({
  count: 0, inc: () => set((s) => ({ count: s.count + 1 })), reset: () => set({ count: 0 }),
}));

interface ChatToken { token: string; user_id: string }

async function ensureClient(userId: string, role: ChatRole, initial: ChatToken): Promise<StreamChat> {
  const streamId = chatUserId(userId, role);
  if (initial.user_id !== streamId) throw new Error('CHAT_IDENTITY_MISMATCH');
  if (!client) client = StreamChat.getInstance(ENV.STREAM_KEY);
  if (client.userID === streamId && client.setUserPromise) {
    await client.setUserPromise;
    return client;
  }
  if (client.userID) await client.disconnectUser();
  let firstToken: ChatToken | null = initial;
  await client.connectUser({ id: streamId }, async () => {
    const data = firstToken ?? await callFunction<ChatToken>('stream-token', { role });
    firstToken = null;
    if (data.user_id !== streamId) throw new Error('CHAT_IDENTITY_MISMATCH');
    return data.token;
  });
  return client;
}

export function attachChat(userId: string, orderId: string, role: ChatRole): Promise<Channel> {
  const streamId = chatUserId(userId, role);
  return enqueue(async () => {
    if (current?.orderId === orderId && current.userId === streamId) return current.channel;
    await stopWatching();
    const data = await callFunction<ChatToken>('stream-token', { order_id: orderId, role });
    const c = await ensureClient(userId, role, data);
    const channel = c.channel('messaging', orderId);
    await channel.watch({ messages: { limit: 50 } });
    await channel.state.loadMessageIntoState('latest');
    channel.state.setIsUpToDate(true);
    const h = channel.on('message.new', (e) => {
      if (e.user?.id !== streamId && !chatScreenOpen) useChatUnread.getState().inc();
    });
    current = { userId: streamId, orderId, channel, off: () => h.unsubscribe() };
    return channel;
  });
}

async function stopWatching() {
  if (current) { try { current.off(); await current.channel.stopWatching(); } catch { /* bỏ qua */ } }
  current = null;
  useChatUnread.getState().reset();
}

// BR-15: gọi khi đơn rời trạng thái cho phép chat (hoàn tất sửa chữa / hủy / kết thúc)
export function detachChat() {
  return enqueue(async () => {
    await stopWatching();
    try { await client?.disconnectUser(); } catch { /* bỏ qua */ }
  });
}

interface Msg { id: string; text: string; mine: boolean | null; at: Date }
type MessageChange = { value: Msg | null; version: number };
type ChatMessage = MessageResponse | Channel['state']['messages'][number];
const sortMessages = (messages: Msg[]) => messages.sort((a, b) => a.at.getTime() - b.at.getTime() || a.id.localeCompare(b.id));

export function ChatScreen({ orderId, userId, role, peerId, readOnly, quickReplies, peerName, onBack }: {
  orderId: string; userId: string; role: ChatRole; peerId: string; readOnly?: boolean; quickReplies?: string[]; peerName?: string; onBack: () => void;
}) {
  const [channel, setChannel] = useState<Channel | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<Msg>>(null);
  const changes = useRef(new Map<string, MessageChange>());
  const activeChannel = useRef<Channel | null>(null);

  const change = (m: ChatMessage, deleted = false): MessageChange => {
    const sender = resolveChatSender(m.user?.id, {
      customer_id: role === 'customer' ? userId : peerId,
      mechanic_id: role === 'mechanic' ? userId : peerId,
    });
    const hidden = deleted || m.type === 'deleted' || m.type === 'system' || !!m.deleted_at || !!m.shadowed || (!!m.parent_id && !m.show_in_channel);
    return {
      version: new Date(m.deleted_at ?? m.updated_at ?? (deleted ? Date.now() : m.created_at) ?? Date.now()).getTime(),
      value: hidden ? null : { id: m.id, text: m.text ?? '', mine: sender ? sender.role === role && sender.userId === userId : null, at: new Date(m.created_at ?? Date.now()) },
    };
  };

  const applyMessage = (message: ChatMessage, deleted = false) => {
    const update = change(message, deleted);
    const previous = changes.current.get(message.id);
    if (previous && (previous.version > update.version || (previous.version === update.version && previous.value === null))) return;
    changes.current.set(message.id, update);
    setMsgs((items) => sortMessages([
      ...items.filter((m) => m.id !== message.id),
      ...(update.value ? [update.value] : []),
    ]));
  };

  const read = (ch: Channel) => {
    const snapshot = new Map((ch.state.latestMessages ?? ch.state.messages).map((m) => [m.id, change(m)]));
    // Giữ sự kiện vừa nhận nếu phản hồi tải lại chứa phiên bản cũ hơn.
    for (const [id, update] of changes.current) {
      if (!snapshot.has(id) || snapshot.get(id)!.version <= update.version) snapshot.set(id, update);
    }
    changes.current = snapshot;
    setMsgs(sortMessages([...snapshot.values()].flatMap(({ value }) => value ? [value] : [])));
    ch.state.setIsUpToDate(true);
  };

  useEffect(() => {
    let active = true;
    let off: (() => void) | undefined;
    changes.current.clear();
    activeChannel.current = null;
    setChannel(null);
    setMsgs([]);
    setError('');
    chatScreenOpen = true;
    useChatUnread.getState().reset();
    (async () => {
      try {
        const ch = await attachChat(userId, orderId, role);
        if (!active) return;
        activeChannel.current = ch;
        setChannel(ch);
        read(ch);
        const markRead = () => { if (!readOnly) void ch.markRead().catch(() => {}); };
        const subscriptions = [
          ch.on('message.new', (e) => {
            if (!active || !e.message) return;
            applyMessage(e.message);
            markRead();
          }),
          ch.on('message.updated', (e) => { if (active && e.message) applyMessage(e.message); }),
          ch.on('message.deleted', (e) => { if (active && e.message) applyMessage(e.message, true); }),
          ch.getClient().on('connection.recovered', () => { if (active) { read(ch); markRead(); } }),
          ch.getClient().on('channels.queried', (e) => {
            if (active && e.queriedChannels?.channels.some((item) => item.channel.cid === ch.cid)) read(ch);
          }),
        ];
        let refreshing = false;
        const appState = AppState.addEventListener('change', (state) => {
          if (state !== 'active' || !active || refreshing || readOnly) return;
          refreshing = true;
          void ch.watch({ messages: { limit: 50 } }).then(() => {
            if (active) { read(ch); markRead(); }
          }).catch(() => { /* SDK sẽ khôi phục khi kết nối mạng trở lại. */ }).finally(() => { refreshing = false; });
        });
        off = () => { subscriptions.forEach((s) => s.unsubscribe()); appState.remove(); };
        await ch.markRead().catch(() => {});
      } catch (e: any) {
        if (!active) return;
        setError(e?.message === 'CHAT_CLOSED' ? 'Cuộc trò chuyện đã kết thúc.' : 'Không kết nối được tin nhắn. Vui lòng thử lại.');
      }
    })();
    return () => { active = false; activeChannel.current = null; chatScreenOpen = false; off?.(); };
  }, [orderId, userId, role, peerId, readOnly, attempt]);

  const send = async (t: string) => {
    const body = t.trim();
    if (!body || !channel || sending || readOnly) return;
    setSending(true);
    try {
      const { message } = await channel.sendMessage({ text: body });
      if (activeChannel.current === channel) {
        setText('');
        applyMessage(message);
      }
    } catch {
      toast('Gửi tin nhắn không thành công', 'error');
    } finally { setSending(false); }
  };

  return (
    <Screen title={peerName ?? 'Tin nhắn'} subtitle={readOnly ? 'Cuộc trò chuyện đã kết thúc' : 'Trao đổi về đơn cứu hộ'} onBack={onBack} scroll={false} padded={false}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}>
        {!channel && !error ? <Spinner text="Đang kết nối…" /> : (
          <>
            {!!error && (
              <View style={{ padding: 16, gap: 12 }}>
                <Text style={{ color: colors.danger, textAlign: 'center' }}>{error}</Text>
                {!readOnly && <Button title="Thử lại" onPress={() => setAttempt((n) => n + 1)} />}
              </View>
            )}
            <FlatList
              ref={listRef}
              data={[...msgs].reverse()}
              inverted
              maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: 80 }}
              keyExtractor={(m) => m.id}
              contentContainerStyle={{ padding: 12, gap: 6 }}
              ListEmptyComponent={!error ? <Text style={[font.sub, { textAlign: 'center', transform: Platform.OS === 'android' ? [{ scale: -1 }] : [{ scaleY: -1 }], marginTop: 24 }]}>Chưa có tin nhắn. Hãy chào đối phương nhé!</Text> : undefined}
              renderItem={({ item }) => (
                <View style={{ alignItems: item.mine === null ? 'center' : item.mine ? 'flex-end' : 'flex-start' }}>
                  <View style={{
                    maxWidth: '80%', paddingVertical: 9, paddingHorizontal: 14, borderRadius: 18,
                    backgroundColor: item.mine ? colors.primary : colors.card,
                    borderBottomRightRadius: item.mine ? 4 : 18, borderBottomLeftRadius: item.mine ? 18 : 4,
                  }}>
                    <Text style={{ color: item.mine ? '#fff' : colors.text, fontSize: 15 }}>{item.text}</Text>
                  </View>
                  {item.mine === null && <Text style={[font.sub, { fontSize: 10, marginTop: 2 }]}>Tin nhắn cũ · Chưa xác định người gửi</Text>}
                  <Text style={{ fontSize: 10, color: colors.sub, marginTop: 2, marginHorizontal: 4 }}>
                    {`${String(item.at.getHours()).padStart(2, '0')}:${String(item.at.getMinutes()).padStart(2, '0')}`}
                  </Text>
                </View>
              )}
            />
            {!readOnly && !error && (
              <View style={{ backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.line, paddingBottom: 8 }}>
                {!!quickReplies?.length && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 8, gap: 8 }}>
                    {quickReplies.map((q) => (
                      <Pressable key={q} onPress={() => send(q)} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: colors.primarySoft }}>
                        <Text style={{ color: colors.primaryDark, fontWeight: '600', fontSize: 13 }}>{q}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                )}
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', padding: 10, gap: 8 }}>
                  <TextInput
                    value={text} onChangeText={setText} placeholder="Nhập tin nhắn…" placeholderTextColor="#98A2B3" multiline
                    style={{ flex: 1, maxHeight: 110, backgroundColor: colors.bg, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, color: colors.text }}
                  />
                  <Pressable onPress={() => send(text)} disabled={!text.trim() || sending}
                    style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: text.trim() ? colors.primary : colors.line, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="send" size={19} color="#fff" />
                  </Pressable>
                </View>
              </View>
            )}
          </>
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}
