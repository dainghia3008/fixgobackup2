import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  callFunction: vi.fn(), connectUser: vi.fn(), disconnectUser: vi.fn(), channel: vi.fn(),
  clientOn: vi.fn(), appStateOn: vi.fn(),
  authUserId: 'customer',
  client: { userID: undefined as string | undefined, setUserPromise: null as Promise<unknown> | null },
}));
vi.mock('react-native', () => ({
  FlatList: 'FlatList', KeyboardAvoidingView: 'KeyboardAvoidingView', Pressable: 'Pressable',
  ScrollView: 'ScrollView', Text: 'Text', TextInput: 'TextInput', View: 'View',
  AppState: { addEventListener: mocks.appStateOn },
  Platform: { OS: 'android', select: (options: any) => options.android ?? options.default },
}));
vi.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
vi.mock('stream-chat', () => ({ StreamChat: { getInstance: () => Object.assign(mocks.client, {
  connectUser: mocks.connectUser, disconnectUser: mocks.disconnectUser, channel: mocks.channel,
  on: mocks.clientOn,
}) } }));
vi.mock('../../shared/mobile/env', () => ({ ENV: { STREAM_KEY: 'stream-key' } }));
vi.mock('../../shared/mobile/supabase', () => ({ callFunction: mocks.callFunction }));
vi.mock('../../shared/mobile/ui', () => ({ Button: 'Button', Screen: 'Screen', Spinner: 'Spinner', toast: vi.fn() }));

import { attachChat, ChatScreen, detachChat, useChatUnread } from '../../shared/mobile/chat';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function channel() {
  const listeners = new Map<string, Set<(event: any) => void>>();
  return {
    state: { messages: [] as any[], loadMessageIntoState: vi.fn().mockResolvedValue(undefined), setIsUpToDate: vi.fn() },
    watch: vi.fn().mockResolvedValue({}), stopWatching: vi.fn().mockResolvedValue({}),
    on: vi.fn((type: string, callback: (event: any) => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(callback);
      return { unsubscribe: vi.fn(() => listeners.get(type)!.delete(callback)) };
    }),
    emit: (type: string, event: any) => listeners.get(type)?.forEach((callback) => callback({ type, ...event })),
    getClient: () => ({ on: mocks.clientOn }),
    markRead: vi.fn().mockResolvedValue({}),
    sendMessage: vi.fn().mockResolvedValue({}),
  };
}
let tree: ReturnType<typeof create> | undefined;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  mocks.client.userID = undefined;
  mocks.client.setUserPromise = null;
  mocks.authUserId = 'customer';
  mocks.clientOn.mockReturnValue({ unsubscribe: vi.fn() });
  mocks.appStateOn.mockReturnValue({ remove: vi.fn() });
  mocks.callFunction.mockImplementation(async (_name, body) => ({ token: 'stream-token', user_id: `${body.role}_${mocks.authUserId}` }));
  mocks.connectUser.mockImplementation(({ id }) => {
    mocks.client.userID = id;
    mocks.client.setUserPromise = Promise.resolve({});
    return mocks.client.setUserPromise;
  });
  mocks.disconnectUser.mockImplementation(async () => {
    mocks.client.userID = undefined;
    mocks.client.setUserPromise = null;
  });
  mocks.channel.mockImplementation(() => channel());
});
afterEach(async () => {
  if (tree) await act(async () => tree!.unmount());
  tree = undefined;
  await detachChat();
});

describe('Kết nối chat dùng chung cho hai app', () => {
  it('runtime và màn hình mở đồng thời chỉ tạo một kết nối và listener', async () => {
    const connected = deferred<unknown>();
    mocks.connectUser.mockImplementation(({ id }) => {
      mocks.client.userID = id;
      mocks.client.setUserPromise = connected.promise;
      return connected.promise;
    });
    const first = attachChat('customer', 'order-1', 'customer');
    const second = attachChat('customer', 'order-1', 'customer');
    await vi.waitFor(() => expect(mocks.connectUser).toHaveBeenCalledOnce());
    expect(mocks.channel).not.toHaveBeenCalled();
    connected.resolve({});
    const [a, b] = await Promise.all([first, second]);
    expect(a).toBe(b);
    expect(a.watch).toHaveBeenCalledOnce();
    expect(a.on).toHaveBeenCalledOnce();
  });

  it('đổi tài khoản trên cùng đơn phải ngắt kết nối người cũ', async () => {
    const old = await attachChat('customer', 'order-1', 'customer');
    mocks.authUserId = 'mechanic';
    const next = await attachChat('mechanic', 'order-1', 'mechanic');
    expect(next).not.toBe(old);
    expect(old.stopWatching).toHaveBeenCalledOnce();
    expect(mocks.disconnectUser).toHaveBeenCalledOnce();
    expect(mocks.connectUser.mock.calls.map(([user]) => user.id)).toEqual(['customer_customer', 'mechanic_mechanic']);
  });

  it('đăng xuất trong khi kết nối đang chờ vẫn đóng kết nối sau khi hoàn tất', async () => {
    const watched = deferred<unknown>();
    const ch = channel();
    ch.watch.mockReturnValue(watched.promise);
    mocks.channel.mockReturnValue(ch);
    const attach = attachChat('customer', 'order-1', 'customer');
    await vi.waitFor(() => expect(ch.watch).toHaveBeenCalledOnce());
    const detach = detachChat();
    watched.resolve({});
    await Promise.all([attach, detach]);
    expect(ch.stopWatching).toHaveBeenCalledOnce();
    expect(mocks.client.userID).toBeUndefined();
    expect(useChatUnread.getState().count).toBe(0);
  });

  it('thử lại trên màn hình sau lỗi cấp kênh sẽ hiện khung gửi tin', async () => {
    mocks.callFunction.mockRejectedValueOnce(new Error('INTERNAL'));
    await act(async () => {
      tree = create(React.createElement(ChatScreen, { userId: 'customer', role: 'customer', peerId: 'mechanic', orderId: 'order-1', onBack: vi.fn() }));
    });
    expect(JSON.stringify(tree!.toJSON())).toContain('Không kết nối được');
    expect(tree!.root.findByType('FlatList').props.ListEmptyComponent).toBeUndefined();
    await act(async () => { tree!.root.findByType('Button').props.onPress(); });
    expect(tree!.root.findAllByType('Text').flatMap((node) => node.children).join('')).not.toContain('Không kết nối được');
    expect(tree!.root.findByType('TextInput')).toBeDefined();
  });

  it('rời màn hình trong khi tải không đăng ký listener của màn hình đã đóng', async () => {
    const watched = deferred<unknown>();
    const ch = channel();
    ch.watch.mockReturnValue(watched.promise);
    mocks.channel.mockReturnValue(ch);
    await act(async () => {
      tree = create(React.createElement(ChatScreen, { userId: 'customer', role: 'customer', peerId: 'mechanic', orderId: 'order-1', onBack: vi.fn() }));
    });
    await act(async () => tree!.unmount());
    tree = undefined;
    await act(async () => { watched.resolve({}); await attachChat('customer', 'order-1', 'customer'); });
    expect(ch.on).toHaveBeenCalledTimes(1); // chỉ listener đếm tin chưa đọc của runtime
    expect(ch.markRead).not.toHaveBeenCalled();
  });

  it.each(['customer', 'mechanic'] as const)('%s: cùng UUID vẫn hiển thị đối phương bên trái và tin của mình bên phải', async (role) => {
    const ch = channel();
    ch.state.messages = [
      { id: 'c', text: 'Khách gửi', user: { id: 'customer_customer' }, created_at: new Date() },
      { id: 'm', text: 'Thợ gửi', user: { id: 'mechanic_customer' }, created_at: new Date() },
      { id: 'old', text: 'Tin cũ', user: { id: 'customer' }, created_at: new Date() },
    ];
    mocks.channel.mockReturnValue(ch);
    await act(async () => {
      tree = create(React.createElement(ChatScreen, { userId: 'customer', role, peerId: 'customer', orderId: 'order-1', onBack: vi.fn() }));
    });
    const list = tree!.root.findByType('FlatList').props;
    const customer = list.data.find((item: any) => item.id === 'c');
    const mechanic = list.data.find((item: any) => item.id === 'm');
    const legacy = list.data.find((item: any) => item.id === 'old');
    expect(list.renderItem({ item: customer }).props.style.alignItems).toBe(role === 'customer' ? 'flex-end' : 'flex-start');
    expect(list.renderItem({ item: mechanic }).props.style.alignItems).toBe(role === 'mechanic' ? 'flex-end' : 'flex-start');
    expect(list.renderItem({ item: legacy }).props.style.alignItems).toBe('center');
  });

  it('chuyển vai trò cùng UUID không dùng lại kết nối cũ', async () => {
    const old = await attachChat('customer', 'order-1', 'customer');
    const next = await attachChat('customer', 'order-1', 'mechanic');
    expect(next).not.toBe(old);
    expect(mocks.connectUser.mock.calls.map(([user]) => user.id)).toEqual(['customer_customer', 'mechanic_customer']);
    expect(mocks.disconnectUser).toHaveBeenCalledOnce();
  });

  it('token provider giữ đúng vai trò khi làm mới token', async () => {
    await attachChat('customer', 'order-1', 'mechanic');
    const provider = mocks.connectUser.mock.calls[0][1];
    await provider();
    await provider();
    expect(mocks.callFunction).toHaveBeenLastCalledWith('stream-token', { role: 'mechanic' });
  });

  it('tin từ vai trò đối phương cùng UUID vẫn tăng số chưa đọc', async () => {
    const ch = await attachChat('customer', 'order-1', 'customer');
    const listener = (ch.on as any).mock.calls[0][1];
    listener({ user: { id: 'mechanic_customer' } });
    listener({ user: { id: 'customer_customer' } });
    expect(useChatUnread.getState().count).toBe(1);
  });

  it.each(['customer', 'mechanic'] as const)('%s: tin đến hiển thị ngay từ sự kiện, không cần mở lại hoặc chờ cache SDK', async (role) => {
    const ch = channel();
    mocks.channel.mockReturnValue(ch);
    await act(async () => {
      tree = create(React.createElement(ChatScreen, { userId: 'customer', role, peerId: 'customer', orderId: 'order-1', onBack: vi.fn() }));
    });
    const peer = role === 'customer' ? 'mechanic' : 'customer';
    const message = { id: 'incoming', text: 'Tin vừa đến', type: 'regular', user: { id: `${peer}_customer` }, created_at: '2026-11-24T00:00:00Z' };
    await act(async () => { ch.emit('message.new', { message, user: message.user }); });
    const list = tree!.root.findByType('FlatList').props;
    expect(list.data).toEqual([expect.objectContaining({ id: 'incoming', text: 'Tin vừa đến', mine: false })]);
    expect(list.renderItem({ item: list.data[0] }).props.style.alignItems).toBe('flex-start');
    expect(ch.watch).toHaveBeenCalledTimes(1);
    expect(ch.markRead).toHaveBeenCalledTimes(2);
  });

  it('sự kiện trùng, sửa và xóa tin cập nhật ngay trên hội thoại đang mở', async () => {
    const ch = channel();
    mocks.channel.mockReturnValue(ch);
    await act(async () => {
      tree = create(React.createElement(ChatScreen, { userId: 'customer', role: 'customer', peerId: 'customer', orderId: 'order-1', onBack: vi.fn() }));
    });
    const message = { id: 'incoming', text: 'Ban đầu', type: 'regular', user: { id: 'mechanic_customer' }, created_at: '2026-11-24T00:00:00Z' };
    await act(async () => {
      ch.emit('message.new', { message, user: message.user });
      ch.emit('message.new', { message, user: message.user });
      ch.emit('message.updated', { message: { ...message, text: 'Đã sửa' } });
    });
    expect(tree!.root.findByType('FlatList').props.data).toEqual([expect.objectContaining({ id: 'incoming', text: 'Đã sửa' })]);
    await act(async () => { ch.emit('message.deleted', { message: { ...message, deleted_at: '2026-11-24T00:02:00Z' } }); });
    expect(tree!.root.findByType('FlatList').props.data).toEqual([]);
    await act(async () => { ch.emit('message.new', { message, user: message.user }); });
    expect(tree!.root.findByType('FlatList').props.data).toEqual([]);
  });

  it('kết nối được khôi phục tự hiển thị tin bị lỡ trong khi mất mạng', async () => {
    const ch = channel();
    mocks.channel.mockReturnValue(ch);
    await act(async () => {
      tree = create(React.createElement(ChatScreen, { userId: 'customer', role: 'customer', peerId: 'customer', orderId: 'order-1', onBack: vi.fn() }));
    });
    // SDK khôi phục cache trước khi phát connection.recovered.
    ch.state.messages = [{ id: 'missed', text: 'Tin lúc mất mạng', user: { id: 'mechanic_customer' }, created_at: new Date() }];
    const recovered = mocks.clientOn.mock.calls.find(([type]) => type === 'connection.recovered')?.[1];
    expect(recovered).toBeDefined();
    await act(async () => { recovered({ type: 'connection.recovered' }); });
    expect(tree!.root.findByType('FlatList').props.data).toEqual([expect.objectContaining({ id: 'missed' })]);
  });

  it('trở lại foreground đồng bộ tin mới, giữ sự kiện mới hơn phản hồi và dọn listener khi thoát', async () => {
    const ch = channel();
    mocks.channel.mockReturnValue(ch);
    await act(async () => {
      tree = create(React.createElement(ChatScreen, { userId: 'customer', role: 'customer', peerId: 'customer', orderId: 'order-1', onBack: vi.fn() }));
    });
    const foreground = mocks.appStateOn.mock.calls[0][1];
    const refresh = deferred<unknown>();
    ch.watch.mockReturnValue(refresh.promise);
    await act(async () => { foreground('active'); });
    const original = { id: 'incoming', text: 'Ban đầu', user: { id: 'mechanic_customer' }, created_at: '2026-11-24T00:00:00Z' };
    await act(async () => {
      ch.emit('message.updated', { message: { ...original, text: 'Mới nhất', updated_at: '2026-11-24T00:01:00Z' } });
      ch.state.messages = [original];
      refresh.resolve({});
      await refresh.promise;
    });
    expect(tree!.root.findByType('FlatList').props.data).toEqual([expect.objectContaining({ id: 'incoming', text: 'Mới nhất' })]);
    expect(ch.watch).toHaveBeenCalledTimes(2);
    const recovered = mocks.clientOn.mock.calls.find(([type]) => type === 'connection.recovered')![1];
    await act(async () => {
      ch.state.messages = [{ ...original, text: 'Đã đồng bộ', updated_at: '2026-11-24T00:03:00Z' }];
      recovered({ type: 'connection.recovered' });
      ch.emit('message.updated', { message: { ...original, text: 'Sự kiện cũ', updated_at: '2026-11-24T00:02:00Z' } });
    });
    expect(tree!.root.findByType('FlatList').props.data).toEqual([expect.objectContaining({ id: 'incoming', text: 'Đã đồng bộ' })]);
    await act(async () => tree!.unmount());
    tree = undefined;
    expect(mocks.appStateOn.mock.results[0].value.remove).toHaveBeenCalledOnce();
    for (const result of mocks.clientOn.mock.results) expect(result.value.unsubscribe).toHaveBeenCalled();
  });

  it('phản hồi gửi tin không làm mất tin đối phương vừa tới và không hiển thị trùng', async () => {
    const ch = channel();
    mocks.channel.mockReturnValue(ch);
    await act(async () => {
      tree = create(React.createElement(ChatScreen, { userId: 'customer', role: 'customer', peerId: 'customer', orderId: 'order-1', onBack: vi.fn() }));
    });
    const outgoing = { id: 'sent', text: 'Xin chào', user: { id: 'customer_customer' }, created_at: '2026-11-24T00:00:00Z' };
    const incoming = { id: 'reply', text: 'Tôi đang tới', user: { id: 'mechanic_customer' }, created_at: '2026-11-24T00:00:01Z' };
    ch.sendMessage.mockImplementation(async () => {
      ch.emit('message.new', { message: outgoing, user: outgoing.user });
      ch.emit('message.new', { message: incoming, user: incoming.user });
      return { message: outgoing };
    });
    await act(async () => { tree!.root.findByType('TextInput').props.onChangeText('Xin chào'); });
    await act(async () => {
      const send = tree!.root.findAllByType('Pressable').find((node) => node.findAllByType('Icon').some((icon) => icon.props.name === 'send'))!;
      await send.props.onPress();
    });
    expect(tree!.root.findByType('FlatList').props.data.map((item: any) => item.id)).toEqual(['reply', 'sent']);
    expect(tree!.root.findByType('TextInput').props.value).toBe('');
  });

  it('SDK Stream thật: message.new được render khi hội thoại vẫn đang mở', async () => {
    const { StreamChat: RealStreamChat } = await vi.importActual<typeof import('stream-chat')>('stream-chat');
    const sdk = new RealStreamChat('test-key', { browser: true });
    sdk.userID = 'customer_customer';
    sdk.user = { id: 'customer_customer' };
    sdk.setUserPromise = Promise.resolve({} as any);
    sdk.wsPromise = Promise.resolve({} as any);
    const ch = sdk.channel('messaging', 'order-1');
    vi.spyOn(ch, 'watch').mockResolvedValue({} as any);
    vi.spyOn(ch, 'stopWatching').mockResolvedValue({} as any);
    vi.spyOn(ch, 'markRead').mockResolvedValue({} as any);
    mocks.channel.mockReturnValue(ch);
    await act(async () => {
      tree = create(React.createElement(ChatScreen, { userId: 'customer', role: 'customer', peerId: 'customer', orderId: 'order-1', onBack: vi.fn() }));
    });
    // Cache đang ở trạng thái cần đồng bộ: SDK không tự thêm message.new vào messages.
    ch.state.setIsUpToDate(false);
    await act(async () => {
      sdk.dispatchEvent({ type: 'message.new', cid: ch.cid, user: { id: 'mechanic_customer' },
        message: { id: 'real-event', text: 'Tin từ SDK', type: 'regular', user: { id: 'mechanic_customer' }, created_at: '2026-11-24T00:00:00Z' },
      });
    });
    expect(ch.state.messages).toHaveLength(0);
    expect(tree!.root.findByType('FlatList').props.data).toEqual([expect.objectContaining({ id: 'real-event', text: 'Tin từ SDK', mine: false })]);
  });
});
