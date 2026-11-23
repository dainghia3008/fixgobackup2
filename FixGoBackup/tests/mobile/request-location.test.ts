import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  back: vi.fn(),
  gps: vi.fn(),
  search: vi.fn(),
  reverse: vi.fn(),
  createRequest: vi.fn(),
}));

vi.mock('react-native', () => ({
  View: 'View', Text: 'Text', TextInput: 'TextInput', Pressable: 'Pressable', Image: 'Image',
  FlatList: ({ data, renderItem, keyExtractor }: any) => data.map((item: any) => React.createElement(React.Fragment, { key: keyExtractor(item) }, renderItem({ item }))),
  StyleSheet: { create: (styles: any) => styles },
  Platform: { select: (options: any) => options.default },
}));
vi.mock('expo-router', () => ({ useRouter: () => ({ back: mocks.back, push: vi.fn() }) }));
vi.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
vi.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
vi.mock('@rnmapbox/maps', () => ({
  default: {
    setAccessToken: vi.fn(), StyleURL: { Street: 'street' }, MapView: 'MapView', Camera: 'Camera',
    LocationPuck: 'LocationPuck', MarkerView: 'MarkerView',
  },
}));
vi.mock('@/shared/mobile/env', () => ({ ENV: { MAPBOX_TOKEN: '' } }));
vi.mock('@/shared/mobile/location', () => ({ getCurrentPoint: mocks.gps }));
vi.mock('@/shared/mobile/mapbox-api', () => ({ geocodeSearch: mocks.search, reverseGeocode: mocks.reverse }));
vi.mock('@/shared/mobile/auth', () => ({ useAuth: () => ({ session: { user: { id: 'customer' } } }) }));
vi.mock('@/shared/mobile/media', () => ({ pickFromLibrary: vi.fn(), takePhoto: vi.fn(), uploadToBucket: vi.fn() }));
vi.mock('@/actions', () => ({ createRequest: mocks.createRequest, resync: vi.fn() }));
vi.mock('@/shared/mobile/ui', () => ({
  Button: 'Button', RoundButton: 'RoundButton', Sheet: 'Sheet', Card: 'Card', Chip: 'Chip',
  Field: 'Field', H: 'H', Row: 'Row', Screen: 'Screen', toast: vi.fn(),
}));

import ChangeLocation from '../../fixgo-user/app/request/location';
import NewRequest from '../../fixgo-user/app/request/new';
import { useDraft } from '../../fixgo-user/src/draft';

const A = { lat: 10.7769, lng: 106.7009, address: 'Địa chỉ ban đầu' };
const B = { lat: 10.8231, lng: 106.6297 };
const C = { lat: 10.85, lng: 106.65 };
let mounted: ReturnType<typeof create>[] = [];

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function mount(Component: React.ComponentType) {
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(React.createElement(Component)); });
  mounted.push(tree);
  return tree;
}

async function idle(tree: ReturnType<typeof create>, p: { lat: number; lng: number }) {
  await act(async () => tree.root.findByType('MapView').props.onMapIdle({ properties: { center: [p.lng, p.lat] } }));
}

async function moveCamera(tree: ReturnType<typeof create>, p: { lat: number; lng: number }, isGestureActive = true) {
  await act(async () => tree.root.findByType('MapView').props.onCameraChanged({
    properties: { center: [p.lng, p.lat] }, gestures: { isGestureActive },
  }));
}

async function press(tree: ReturnType<typeof create>, title: string) {
  await act(async () => tree.root.findAllByType('Button').find((node) => node.props.title === title)!.props.onPress());
}

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  vi.clearAllMocks();
  useDraft.getState().setLoc(A);
  mocks.reverse.mockResolvedValue(null);
  mocks.search.mockResolvedValue([]);
  mocks.gps.mockResolvedValue(B);
});

afterEach(async () => {
  await act(async () => { for (const tree of mounted) tree.unmount(); });
  mounted = [];
  vi.useRealTimers();
});

describe('Vị trí trong form yêu cầu cứu hộ', () => {
  it('Android không phát onMapIdle: kéo bản đồ vẫn cập nhật form sau khi xác nhận', async () => {
    const form = await mount(NewRequest);
    const picker = await mount(ChangeLocation);
    await moveCamera(picker, B);
    await press(picker, 'Xác nhận vị trí');
    expect(useDraft.getState().loc).toEqual({ ...B, address: '10.82310, 106.62970' });
    expect(form.root.findByType('Camera').props.centerCoordinate).toEqual([B.lng, B.lat]);
  });

  it('lấy tọa độ cuối khi bản đồ trượt theo quán tính mà không có onMapIdle', async () => {
    const tree = await mount(ChangeLocation);
    await moveCamera(tree, B);
    await moveCamera(tree, C, false);
    await press(tree, 'Xác nhận vị trí');
    expect(useDraft.getState().loc).toEqual({ ...C, address: '10.85000, 106.65000' });
  });

  it('animation mở bản đồ không ghi đè vị trí ban đầu', async () => {
    const tree = await mount(ChangeLocation);
    await moveCamera(tree, B, false);
    await press(tree, 'Xác nhận vị trí');
    expect(useDraft.getState().loc).toEqual(A);
  });

  it('animation về GPS sau khi kéo không lưu tọa độ trung gian', async () => {
    const tree = await mount(ChangeLocation);
    await moveCamera(tree, C);
    await press(tree, 'Dùng vị trí hiện tại');
    await moveCamera(tree, C, false);
    await press(tree, 'Xác nhận vị trí');
    expect(useDraft.getState().loc).toEqual({ ...B, address: '10.82310, 106.62970' });
  });

  it('lưu địa chỉ tìm kiếm ngay cả khi camera chưa phát sự kiện dừng', async () => {
    const result = { ...B, id: 'place-b', title: 'Địa điểm B', address: 'Địa chỉ B' };
    mocks.search.mockResolvedValue([result]);
    const tree = await mount(ChangeLocation);
    await act(async () => tree.root.findByType('TextInput').props.onChangeText('Địa điểm B'));
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    await act(async () => tree.root.findAllByType('Pressable').find((node) => node.findAllByType('Text').length === 2)!.props.onPress());
    await press(tree, 'Xác nhận vị trí');
    expect(useDraft.getState().loc).toEqual({ ...B, address: 'Địa chỉ B' });
    expect(mocks.back).toHaveBeenCalledOnce();
  });

  it('lưu GPS mới ngay cả khi camera chưa dừng và địa chỉ chưa tải xong', async () => {
    const tree = await mount(ChangeLocation);
    await press(tree, 'Dùng vị trí hiện tại');
    await press(tree, 'Xác nhận vị trí');
    expect(useDraft.getState().loc).toEqual({ ...B, address: '10.82310, 106.62970' });
  });

  it('kéo bản đồ rồi xác nhận ngay không dùng địa chỉ của vị trí cũ', async () => {
    const tree = await mount(ChangeLocation);
    await idle(tree, B);
    await press(tree, 'Xác nhận vị trí');
    expect(useDraft.getState().loc).toEqual({ ...B, address: '10.82310, 106.62970' });
  });

  it('phản hồi địa chỉ cũ đến muộn không ghi đè địa chỉ mới', async () => {
    const oldAddress = deferred<string>();
    mocks.reverse.mockReturnValueOnce(oldAddress.promise).mockResolvedValueOnce('Địa chỉ C');
    const tree = await mount(ChangeLocation);
    await idle(tree, B);
    await act(async () => { await vi.advanceTimersByTimeAsync(350); });
    await idle(tree, C);
    await act(async () => { await vi.advanceTimersByTimeAsync(350); });
    await act(async () => { oldAddress.resolve('Địa chỉ B'); });
    await press(tree, 'Xác nhận vị trí');
    expect(useDraft.getState().loc).toEqual({ ...C, address: 'Địa chỉ C' });
  });

  it('cập nhật địa chỉ không đặt camera về tọa độ ban đầu', async () => {
    mocks.reverse.mockResolvedValue('Địa chỉ B');
    const tree = await mount(ChangeLocation);
    const camera = tree.root.findByType('Camera').props.centerCoordinate;
    await idle(tree, B);
    await act(async () => { await vi.advanceTimersByTimeAsync(350); });
    expect(tree.root.findByType('Camera').props.centerCoordinate).toBe(camera);
    await press(tree, 'Xác nhận vị trí');
    expect(useDraft.getState().loc).toEqual({ ...B, address: 'Địa chỉ B' });
  });

  it('vẫn quay lại GPS khi tọa độ GPS trùng với tâm bản đồ ban đầu', async () => {
    mocks.gps.mockResolvedValue(A);
    const tree = await mount(ChangeLocation);
    const camera = tree.root.findByType('Camera').props.centerCoordinate;
    await idle(tree, B);
    await press(tree, 'Dùng vị trí hiện tại');
    expect(tree.root.findByType('Camera').props.centerCoordinate).not.toBe(camera);
    expect(tree.root.findByType('Camera').props.centerCoordinate).toEqual([A.lng, A.lat]);
    await press(tree, 'Xác nhận vị trí');
    expect(useDraft.getState().loc).toMatchObject({ lat: A.lat, lng: A.lng });
  });

  it('thoát màn hình không lưu lựa chọn và huỷ tra cứu đang chờ', async () => {
    const tree = await mount(ChangeLocation);
    await idle(tree, B);
    await act(async () => tree.unmount());
    mounted = [];
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(useDraft.getState().loc).toEqual(A);
    expect(mocks.reverse).not.toHaveBeenCalled();
  });

  it('GPS mặc định đến muộn không ghi đè vị trí chọn thủ công', async () => {
    const gps = deferred<typeof B>();
    mocks.gps.mockReturnValue(gps.promise);
    useDraft.getState().setLoc(null);
    await mount(NewRequest);
    await act(async () => { useDraft.getState().setLoc({ ...C, address: 'Địa chỉ C' }); });
    await act(async () => { gps.resolve(B); });
    expect(useDraft.getState().loc).toEqual({ ...C, address: 'Địa chỉ C' });
  });

  it('địa chỉ GPS mặc định đến muộn không ghi đè vị trí chọn thủ công', async () => {
    const address = deferred<string>();
    mocks.reverse.mockReturnValue(address.promise);
    useDraft.getState().setLoc(null);
    await mount(NewRequest);
    await act(async () => { useDraft.getState().setLoc({ ...C, address: 'Địa chỉ C' }); });
    await act(async () => { address.resolve('Địa chỉ B'); });
    expect(useDraft.getState().loc).toEqual({ ...C, address: 'Địa chỉ C' });
  });

  it('form giữ thông tin đã nhập, hiển thị và gửi vị trí mới sau khi xác nhận', async () => {
    const form = await mount(NewRequest);
    await act(async () => {
      form.root.findAllByType('Field').find((node) => node.props.label === 'Dòng xe')!.props.onChangeText('Honda Vision');
      form.root.findAllByType('Field').find((node) => node.props.label === 'Biển số')!.props.onChangeText('59X1-123.45');
      form.root.findAllByType('Field').find((node) => node.props.label === 'Mô tả sự cố')!.props.onChangeText('Xe bị thủng lốp');
      form.root.findAllByType('Chip')[0].props.onPress();
    });
    const picker = await mount(ChangeLocation);
    await idle(picker, B);
    await press(picker, 'Xác nhận vị trí');
    expect(form.root.findByType('Camera').props.centerCoordinate).toEqual([B.lng, B.lat]);
    expect(form.root.findAllByType('Text').some((node) => node.props.children === '10.82310, 106.62970')).toBe(true);
    expect(form.root.findAllByType('Field').find((node) => node.props.label === 'Dòng xe')!.props.value).toBe('Honda Vision');
    await act(async () => form.root.findByType('Screen').props.footer.props.onPress());
    expect(mocks.createRequest).toHaveBeenCalledWith({
      ...B, address: '10.82310, 106.62970', incident_types: ['flat_tire'],
      vehicle_model: 'Honda Vision', license_plate: '59X1-123.45', description: 'Xe bị thủng lốp', media: [],
    });
  });
});
