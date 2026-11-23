# FixGo – Nền tảng cứu hộ xe máy

Đồ án **Nhập môn Công nghệ phần mềm**. Gồm 3 ứng dụng + 1 backend trên Supabase, bám sát file đặc tả `FixGo_Specify_Final_Updated.docx`.

| Thành phần                     | Công nghệ                                                                                      | Thư mục             |
| ------------------------------ | ---------------------------------------------------------------------------------------------- | ------------------- |
| App **Khách hàng** (U-01…U-20) | Expo development build (EAS Cloud), React Native, TypeScript, Expo Router                      | `fixgo-user/`       |
| App **Thợ** (M-01…M-16)        | Expo development build (EAS Cloud), React Native, TypeScript, Expo Router                      | `fixgo-mechanic/`   |
| **Admin** (A-01…A-07)          | Next.js 16, React, TypeScript (deploy Vercel)                                                  | `fixgo-admin/`      |
| Backend                        | Supabase: Postgres + PostGIS, Auth (Gmail SMTP), Realtime (Broadcast), Storage, Edge Functions | `supabase/`         |
| Bản đồ / tìm đường / geocoding | Mapbox (`@rnmapbox/maps`, Directions, Matrix, Geocoding v6)                                    | –                   |
| Chat                           | Stream Chat (`stream-chat`)                                                                    | –                   |
| AI cho thợ                     | Gemini API (qua Edge Function `ai-assistant`)                                                  | –                   |
| Logic dùng chung + kiểm thử    | TypeScript thuần, Vitest                                                                       | `shared/`, `tests/` |

> **Ưu tiên cloud, hạn chế cài local:** không cần Docker, không cần Postgres local. Build app bằng **EAS Cloud**, deploy backend bằng `npx supabase …` (không cần cài global), Admin chạy trên Vercel. Máy bạn chỉ cần Node.js, Git và Android Studio (để chạy emulator).

---

## 0. Trạng thái kiểm chứng (đọc trước)

Mã nguồn được viết trong môi trường **không có mạng và không có Expo/Supabase/Android emulator**, nên:

| Hạng mục                                                                                                                                                            | Trạng thái                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **113 test logic lõi** (`tests/core`: vòng đời đơn, phiếu & highlight, validation, điều hướng, reducer sự kiện real-time, phân phối theo tuyến, tiến độ dẫn đường…) | ✅ **Đã chạy và vượt qua 100%**                                                                            |
| Kiểm tra kiểu TypeScript (strict) cho `shared/core` + `dispatch-logic`                                                                                              | ✅ Đạt                                                                                                     |
| Kiểm tra cú pháp toàn bộ file `.ts/.tsx` của 3 ứng dụng                                                                                                             | ✅ Không có lỗi cú pháp                                                                                    |
| Bộ kiểm thử tích hợp backend (`tests/backend`, ~20 kịch bản trên Supabase thật: BR-01…BR-17, chốt đồng thời, RLS, real-time…)                                       | ⚠️ **Đã viết đầy đủ nhưng chưa chạy được** ở đây – bạn chạy theo mục 8. Nếu có test đỏ, gửi lại log để sửa |
| SQL migration, Edge Function, giao diện app                                                                                                                         | ⚠️ Chưa chạy trên thiết bị thật. Làm theo mục 1–7 rồi kiểm tra theo checklist mục 9                        |

Vì vậy **hãy chạy `npm run test:backend` ngay sau khi deploy xong Supabase** – đó là cách nhanh nhất để phát hiện sai sót (nếu có) ở tầng dữ liệu.

---

## 1. Chuẩn bị máy

1. **Node.js ≥ 22.23.4** (LTS, đã vá lỗi bảo mật) – https://nodejs.org → kiểm tra `node -v`.
2. **Git**.
3. **Android Studio** (Narwhal trở lên) → _More actions ▸ Virtual Device Manager ▸ Create device_: **Pixel 7**, ảnh hệ thống **API 34/35 có “Google Play”**. Dùng để chạy emulator.
4. Cài công cụ EAS (một lần): `npm install -g eas-cli` rồi `eas login`.
5. Các tài khoản (đều có gói miễn phí): **Supabase**, **Mapbox**, **Stream**, **Google AI Studio** (Gemini), **Expo (expo.dev)**, **Google Cloud** (đăng nhập Google), **Meta for Developers** (đăng nhập Facebook), **Gmail** (SMTP), **Vercel** (Admin).

Giải nén dự án rồi mở terminal tại thư mục `fixgo/`.

---

## 2. Supabase – tạo project và cơ sở dữ liệu

1. https://supabase.com → **New project** (chọn region _Southeast Asia – Singapore_). Ghi lại **Project Ref** (chuỗi trong URL `https://<REF>.supabase.co`) và **mật khẩu database**.
2. **Project Settings ▸ API Keys**: ghi lại
   - **Project URL**
   - **Publishable key** (`sb_publishable_…`) hoặc _anon key_ cũ → dùng cho app (`EXPO_PUBLIC_SUPABASE_KEY`)
   - **Secret key** (`sb_secret_…`) hoặc _service_role_ → **chỉ dùng cho kiểm thử/CLI, tuyệt đối không đưa vào app**.
3. Tạo cấu trúc dữ liệu – chọn **một** trong hai cách:
   - **Cách A (đơn giản nhất):** Supabase ▸ **SQL Editor ▸ New query** → dán toàn bộ nội dung file `supabase/setup_all.sql` → **Run**. (File này gộp 6 migration; tạo lại bằng `npm run build:sql` nếu bạn sửa migration.)
   - **Cách B (CLI):** `npx supabase login` → `npx supabase link --project-ref <REF>` → `npx supabase db push --remote` (nhập mật khẩu database).
4. Kiểm tra: **Table Editor** thấy các bảng `customers, mechanics, orders, dispatches, proposals, quotes…`; **Storage** thấy 3 bucket `faces`, `request-media`, `cccd`.

> Script tạo extension **PostGIS** (tìm thợ theo bán kính) và bật **Realtime Authorization** cho kênh riêng tư. Không cần thêm bảng vào publication Realtime vì hệ thống dùng _Broadcast từ CSDL_.

---

## 3. Supabase Auth – Email OTP (Gmail SMTP), Google, Facebook

### 3.1 Gmail SMTP

1. Tài khoản Gmail dùng gửi mã: bật **Xác minh 2 bước** → https://myaccount.google.com/apppasswords → tạo **App password** (16 ký tự).
2. Supabase ▸ **Authentication ▸ Emails ▸ SMTP Settings** → bật _Enable custom SMTP_:
   - Host `smtp.gmail.com`, Port `465`, Username = địa chỉ Gmail, Password = **App password**
   - Sender email = địa chỉ Gmail, Sender name = `FixGo`.
3. **Authentication ▸ Rate Limits**: nâng _Emails sent per hour_ (mặc định rất thấp với SMTP tuỳ chỉnh), ví dụ 30–100. (Gmail giới hạn ~500 thư/ngày.)

### 3.2 Mẫu email có MÃ OTP (bắt buộc)

**Authentication ▸ Emails ▸ Templates**: sửa **cả hai** mẫu **Magic Link** _và_ **Confirm signup** thành (ví dụ):

```html
<h2>Mã xác thực FixGo</h2>
<p>Mã của bạn là: <b style="font-size:24px">{{ .Token }}</b></p>
<p>Mã có hiệu lực trong thời gian ngắn. Không chia sẻ mã này với bất kỳ ai.</p>
```

(Người dùng mới nhận mẫu _Confirm signup_, người dùng cũ nhận _Magic Link_.) Ở **Providers ▸ Email** để **Enable Email provider** = bật. App chấp nhận mã 6–8 chữ số.

### 3.3 URL chuyển hướng cho đăng nhập Google/Facebook

**Authentication ▸ URL Configuration ▸ Redirect URLs** → thêm:

```
fixgo-user://**
fixgo-mechanic://**
exp+fixgo-user://**
exp+fixgo-mechanic://**
```

(Site URL có thể để `http://localhost:3000`.)

### 3.4 Google

1. https://console.cloud.google.com → tạo project → **APIs & Services ▸ OAuth consent screen** (External, thêm email của bạn vào _Test users_).
2. **Credentials ▸ Create credentials ▸ OAuth client ID ▸ Web application**. _Authorized redirect URIs_: `https://<REF>.supabase.co/auth/v1/callback`.
3. Dán **Client ID / Client secret** vào Supabase ▸ **Authentication ▸ Sign In / Providers ▸ Google** → Enable.

### 3.5 Facebook

1. https://developers.facebook.com → **Create app** (loại _Consumer/Authenticate_) → thêm sản phẩm **Facebook Login**.
2. _Valid OAuth Redirect URIs_: `https://<REF>.supabase.co/auth/v1/callback`.
3. Dán **App ID / App Secret** vào Supabase ▸ Providers ▸ **Facebook** → Enable. App ở chế độ _Development_: thêm tài khoản thử vào **Roles ▸ Testers**.

---

## 4. Mapbox, Stream, Gemini

| Dịch vụ                                         | Việc cần làm                                                 | Giá trị cần ghi lại                                                                                           |
| ----------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| **Mapbox** (https://account.mapbox.com)         | Dùng **Default public token**                                | `pk.…` → `EXPO_PUBLIC_MAPBOX_TOKEN`, `MAPBOX_TOKEN` (Edge Function), `NEXT_PUBLIC_MAPBOX_TOKEN` (Admin)       |
|                                                 | **Create a token**, chọn scope **`DOWNLOADS:READ`** (secret) | `sk.…` → `RNMAPBOX_MAPS_DOWNLOAD_TOKEN` (chỉ cần lúc build native trên EAS)                                   |
| **Stream** (https://getstream.io/dashboard)     | **Create app** (Chat)                                        | **API Key** → `EXPO_PUBLIC_STREAM_API_KEY`; **API Secret** → `STREAM_API_SECRET` (Edge Function)              |
| **Gemini** (https://aistudio.google.com/apikey) | **Create API key**                                           | → `GEMINI_API_KEY` (Edge Function). Mặc định dùng model `gemini-flash-latest`, đổi bằng secret `GEMINI_MODEL` |

---

## 5. Deploy Edge Functions + webhook

Tại thư mục gốc `fixgo/` (không cần Docker):

```bash
npx supabase login
npx supabase link --project-ref <REF>

# đặt biến bí mật (OUTBOX_SECRET: chuỗi ngẫu nhiên dài do bạn tự chọn)
npx supabase secrets set MAPBOX_TOKEN=pk.xxx STREAM_API_KEY=xxx STREAM_API_SECRET=xxx GEMINI_API_KEY=xxx OUTBOX_SECRET=chuoi-ngau-nhien-dai

# deploy cả 5 hàm: create-request, ai-assistant, stream-token, stream-webhook, outbox-worker
npx supabase functions deploy --use-api
```

(`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` được Supabase tự cấp cho hàm.)

**Trợ lý AI:** function tự chuyển từ `gemini-flash-latest` sang `gemini-flash-lite-latest` khi model chính quá tải, giới hạn 3 lượt gọi trong 45 giây. Có thể chọn model chính/dự phòng bằng secrets `GEMINI_MODEL` và `GEMINI_FALLBACK_MODEL`. Kết quả hợp lệ được lưu trong `dispatches.ai_result`; mở lại không gọi Gemini thêm. Nếu tất cả model đều quá tải, app thông báo nguyên nhân và hiển thị danh sách kiểm tra có sẵn theo loại sự cố, ghi rõ không phải kết quả AI. Danh sách này không lưu vào cache AI; thợ có thể bấm thử phân tích lại. Lỗi cấu hình key/model được phân biệt riêng.

Sau khi sửa mã AI, deploy riêng bằng `npx supabase functions deploy ai-assistant --use-api --yes`. Để xem log lỗi Gemini: `npx supabase@latest logs --remote --service functions --search Gemini --since 30m --output-format json`.

**Webhook 1 – Stream → lưu nhật ký chat (BR-11) + đẩy thông báo tin nhắn:** Stream Dashboard ▸ app ▸ **Chat ▸ Overview ▸ Webhook**: URL = `https://<REF>.supabase.co/functions/v1/stream-webhook`, bật sự kiện **message.new** (có thể bật “All events”).

**Webhook 2 – Database → hàng đợi thông báo đẩy + đóng chat (BR-15):** Supabase ▸ **Integrations ▸ Database Webhooks ▸ Create a new hook**:

- Table: `public.outbox`, Events: **Insert**
- Type: _Supabase Edge Functions_ → chọn `outbox-worker`, Method `POST`
- **HTTP Headers**: thêm `x-webhook-secret` = đúng giá trị `OUTBOX_SECRET` ở trên.

> Không tạo webhook 2 thì app **vẫn chạy đủ chức năng real-time khi đang mở**, nhưng sẽ không có thông báo đẩy khi chạy nền và kênh chat Stream không bị đóng băng ở máy chủ (app vẫn tự khoá khung chat theo trạng thái đơn).

---

## 6. Tạo tài khoản Admin và chạy trang quản trị

1. Supabase ▸ **Authentication ▸ Users ▸ Add user ▸ Create new user**: email + mật khẩu, tick _Auto Confirm User_.
2. **SQL Editor**:
   ```sql
   insert into public.admins (id) select id from auth.users where email = 'admin@example.com';
   ```
3. Chạy Admin:
   ```bash
   cd fixgo-admin
   npm install
   copy .env.example .env.local     # macOS/Linux: cp .env.example .env.local
   # điền NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_KEY (publishable), NEXT_PUBLIC_MAPBOX_TOKEN
   npm run dev
   ```
   Mở http://localhost:3000 → đăng nhập admin.
4. **Deploy Vercel (khuyến nghị):** import repo → _Root Directory_ = `fixgo-admin` → thêm 3 biến môi trường như trên → Deploy.

---

## 7. Hai app di động (EAS Cloud + Android Studio)

Làm lần lượt cho `fixgo-user` rồi `fixgo-mechanic` (các lệnh y hệt, đổi tên thư mục).

```bash
cd fixgo-user
npm install
npx expo install --fix            # căn chỉnh phiên bản thư viện theo Expo SDK
copy .env.example .env            # macOS/Linux: cp .env.example .env  → điền 4 giá trị (mục 2, 4)
eas init                          # tạo project trên expo.dev, ghi projectId vào app.json
```

1. **Khai báo token tải Mapbox SDK cho EAS** (một lần/app): trang https://expo.dev → project → **Environment variables ▸ Create** → tên `RNMAPBOX_MAPS_DOWNLOAD_TOKEN`, giá trị `sk.…`, _Visibility = Secret_, môi trường _development_. (Hoặc `eas env:create` / `eas secret:create` tuỳ phiên bản eas-cli.)
2. **Build development client trên cloud:**
   ```bash
   eas build --profile development --platform android
   ```
   Khi xong, tải file **.apk** từ link/QR EAS cung cấp (build đầu ~10–20 phút). _Chỉ cần build lại khi đổi thư viện native hoặc `app.config.ts`; sửa code TypeScript không cần build lại._
3. **Cài lên emulator Android Studio:** mở _Virtual Device Manager_ → ▶ khởi động emulator → **kéo-thả file .apk vào cửa sổ emulator** (hoặc `adb install ten-file.apk`).
4. **Chạy ứng dụng:**
   ```bash
   npx expo start --dev-client        # app Khách: cổng 8081
   # app Thợ (terminal khác):  npx expo start --dev-client --port 8082
   ```
   Nhấn `a` để mở trên emulator (hoặc mở app FixGo trong emulator và chọn máy chủ Metro).
   > Lệnh `npm start` tự chạy `sync` để chép thư mục `shared/` vào app.
5. **Giả lập GPS:** emulator ▸ nút `…` ▸ **Location** → nhập toạ độ (ví dụ Quận 1: `10.7769, 106.7009`) rồi _Set location_; hoặc `adb emu geo fix 106.7009 10.7769`. Để thử dẫn đường: **Location ▸ Routes** → chọn 2 điểm → _Play route_.
6. **Cách thử cả 2 app cùng lúc:** mở 2 emulator (app Khách ở emulator 1, app Thợ ở emulator 2) hoặc 1 emulator + 1 điện thoại thật (cắm USB, bật gỡ lỗi USB, cài APK). Đặt vị trí 2 máy cách nhau < 5 km.

### Thông báo đẩy khi chạy nền (tuỳ chọn)

Firebase Console → tạo project → thêm 2 app Android (`com.fixgo.user`, `com.fixgo.mechanic`) → tải `google-services.json` đặt vào thư mục từng app → tạo **service account key** (FCM v1) và tải lên EAS bằng `eas credentials` → build lại. Emulator không có token đẩy; cần điện thoại thật.

---

## 8. Chạy kiểm thử

### 8.1 Test logic lõi – không cần mạng, không cần tài khoản

```bash
npm install            # tại thư mục gốc fixgo/
npm test               # = vitest run tests/core  → 113 test
```

Bao phủ: vòng đời & ma trận hủy đơn, BR-12, chat BR-15, tính tiền & so sánh phiên bản phiếu (highlight), validation form (U-04, M-02, M-07, đánh giá, báo cáo), điều hướng theo trạng thái cho cả 2 app, **reducer xử lý toàn bộ sự kiện real-time** (kể cả sự kiện cũ không ghi đè trạng thái mới, đơn cũ không ảnh hưởng yêu cầu mới), phân lô Mapbox Matrix & lọc **tuyến đường < 5 km**, tính tiến độ/chặng dẫn đường, giảm số request gửi vị trí.

Kiểm thử luồng đổi vị trí trong form cứu hộ (14 test, mô phỏng bản đồ/GPS, không cần emulator):

```bash
npm install --prefix fixgo-user
npm run test:mobile
```

Bao phủ: chọn địa chỉ hoặc GPS rồi xác nhận ngay, kéo bản đồ kể cả khi Android không phát `onMapIdle`, quán tính sau khi thả tay, địa chỉ/GPS trả về muộn, huỷ tra cứu khi thoát màn hình, giữ dữ liệu form và gửi đúng vị trí đã chọn.

### 8.2 Test tích hợp backend – chạy trên Supabase thật

> ⚠️ Test tạo/xoá người dùng và đơn thật. **Dùng một project Supabase dùng thử riêng** (tạo project thứ hai, chạy lại mục 2), không dùng project chính.

```bash
copy tests\.env.test.example tests\.env.test      # macOS/Linux: cp tests/.env.test.example tests/.env.test
# điền SUPABASE_URL, SUPABASE_KEY (publishable), SUPABASE_SERVICE_KEY (secret)
npm run test:backend
```

Bao phủ ~20 kịch bản: BR-12 (chặn đơn thứ hai, nới ở trạng thái 7/8), BR-01/BR-14 (chỉ thợ Online + đã duyệt + chưa khoá + trong bán kính; Online sau không nhận; chỉ phát một lần), BR-13/BR-03/BR-04, **chốt thợ đồng thời** (2 khách cùng chốt 1 thợ → đúng 1 thành công), thợ Offline → đề xuất mất khả dụng, toàn bộ vòng đời phiếu v1→v2→v3 (BR-07, BR-08), thanh toán/đánh giá/BR-17, ma trận hủy, duyệt hồ sơ & thay đổi hồ sơ (BR-16), khoá tài khoản, khiếu nại & nhật ký đơn (BR-10/11), RLS (khách không đọc được CCCD, không ghi trực tiếp bảng…), và **real-time thật** (đúng người nhận sự kiện, kênh vị trí chỉ cho 2 bên).
Kiểm thử phân phối qua Mapbox thật: đặt `TEST_EDGE=1` trong `tests/.env.test` (cần đã deploy `create-request`).

---

## 9. Checklist chạy thử end-to-end (đối chiếu đặc tả)

Chuẩn bị: 1 tài khoản Admin (mục 6), 2 email dùng làm Khách và Thợ.

| #   | Thực hiện                                                                                                                              | Kết quả mong đợi                                                                                      |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 1   | **App Thợ**: đăng nhập Email OTP (hoặc Google/Facebook) → điền hồ sơ M-02 (chụp ảnh mặt + 2 mặt CCCD, họ tên CCCD IN HOA, 12 số) → Gửi | Chuyển M-03 “chờ duyệt”                                                                               |
| 2   | **Admin** ▸ Hồ sơ chờ duyệt (xuất hiện tức thì) → xem ảnh CCCD → Duyệt                                                                 | App Thợ tự sang M-04 (real-time)                                                                      |
| 3   | App Thợ: bật **Online** (cho phép vị trí)                                                                                              | Có công tắc Online; vị trí gửi lên                                                                    |
| 4   | **App Khách**: đăng nhập → (Email lần đầu: nhập họ tên) → _Tạo yêu cầu_ → chọn sự cố, xe, biển số, mô tả, ảnh → Gửi                    | U-06 “Đang tìm thợ”; thợ trong 5 km nhận yêu cầu ở M-04 **không tự mở**                               |
| 5   | Thợ: mở yêu cầu → _Trợ lý AI_ (Gemini) → _Chấp nhận_                                                                                   | U-06 hiện “1 thợ đã chấp nhận”; mở lại không tăng số                                                  |
| 6   | Thợ: gửi đề xuất sơ bộ (thử bấm Offline để thấy bị chặn)                                                                               | Khách sang U-08 thấy thẻ thợ; Thợ chuyển Offline → thẻ biến mất ngay                                  |
| 7   | Khách: xem chi tiết → _Chốt thợ_                                                                                                       | Khách sang U-10 (bản đồ); thợ **bị đưa thẳng** tới M-08                                               |
| 8   | Thợ: _Bắt đầu di chuyển_ → emulator phát route                                                                                         | M-09 có chỉ dẫn từng chặng; khách thấy marker thợ chạy real-time                                      |
| 9   | Hai bên nhắn tin (U-11/M-10)                                                                                                           | Tin nhắn tức thì; Admin xem lại được ở chi tiết đơn                                                   |
| 10  | Thợ: _Xác nhận đã đến_ → lập phiếu (hạng mục + phụ tùng) → _Gửi_                                                                       | Khách sang U-13 xem phiếu                                                                             |
| 11  | Thợ sửa phiếu & _Gửi lại_ khi khách chưa xác nhận                                                                                      | Khách thấy phiên bản 2, phần đổi **tô vàng**; nút xác nhận gắn v2                                     |
| 12  | Khách _Xác nhận phiếu_                                                                                                                 | Cả hai sang “đang sửa”; khách **không có nút hủy**                                                    |
| 13  | Thợ: _Chỉnh sửa phiếu_ trong lúc sửa → gửi lại                                                                                         | Khách quay lại U-13 và có thể **hủy** tại đây                                                         |
| 14  | Thợ: _Hoàn tất sửa chữa_                                                                                                               | Khách sang U-16 (chat kết thúc); thợ sang M-13                                                        |
| 15  | Khách: đánh giá hoặc _Bỏ qua_                                                                                                          | Quay U-03, tạo được yêu cầu mới                                                                       |
| 16  | Thợ: _Đã nhận thanh toán_                                                                                                              | Đơn Hoàn thành; thợ về M-04; hồ sơ thợ có điểm trung bình                                             |
| 17  | Khách: Lịch sử → chi tiết → _Báo cáo thợ_                                                                                              | Admin ▸ Khiếu nại: xem nhật ký (chat, phiếu v1..vn, hành trình) → ghi nhận kết quả, tuỳ chọn khoá thợ |
| 18  | Admin ▸ Quản lý thợ ▸ _Khoá_                                                                                                           | Thợ Offline ngay; thẻ thợ biến khỏi U-08 của khách đang tìm                                           |
| 19  | Thử: 2 khách cùng chốt 1 thợ; khách tạo đơn thứ 2; huỷ ở từng trạng thái                                                               | Đúng theo BR-03/04/12 và ma trận hủy                                                                  |

---

## 10. Thiết kế tối ưu số request & hiệu năng

| Vấn đề                   | Giải pháp                                                                                                                                                                                                                                             |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Không polling            | Mỗi người dùng **một kênh Broadcast riêng tư `user:<uid>`** nhận mọi sự kiện (REQUEST_NEW, PROPOSAL_NEW, MECHANIC_SELECTED…) do **trigger/RPC trong CSDL** phát (`realtime.send`). Không dùng Postgres Changes (tránh kiểm RLS từng dòng/từng người). |
| Mất sự kiện khi rớt mạng | Broadcast không đảm bảo giao → mỗi lần **(kết nối lại / mở app)** gọi **1 RPC** `customer_state` / `mechanic_state` để khôi phục toàn bộ trạng thái (tối đa 1 lần/4 giây).                                                                            |
| Phân phối yêu cầu        | **1 request** từ app → Edge Function: PostGIS lọc 5 km chim bay → **Mapbox Matrix: 1 request / 24 thợ** (không gọi Directions từng thợ) → giữ thợ có **tuyến đường < 5 km** → phát một lần.                                                           |
| Vị trí thợ khi di chuyển | Phát qua **Broadcast** (không ghi DB), chỉ khi ≥ 4 s **hoặc** ≥ 15 m; ghi nhật ký DB theo **lô ~30 s/1 RPC**.                                                                                                                                         |
| Vị trí thợ khi Online    | Gửi khi ≥ 100 m hoặc ≥ 60 s (nhịp tim 4 phút).                                                                                                                                                                                                        |
| Dẫn đường                | Gọi Mapbox Directions **1 lần** khi bắt đầu, gọi lại chỉ khi **lệch tuyến > 60 m** (tối đa 20 s/lần); tiến độ & chặng kế tiếp tính **cục bộ**.                                                                                                        |
| Chat                     | Chỉ kết nối Stream khi đơn **đã chốt thợ**, ngắt khi hết sửa chữa/hủy.                                                                                                                                                                                |
| AI                       | Chỉ gọi Gemini khi thợ bấm; kết quả **lưu cache** theo (đơn, thợ).                                                                                                                                                                                    |
| Tính nhất quán           | Mọi thao tác ghi qua **RPC giao dịch**; `unique index` đảm bảo BR-12/BR-04; khoá hàng theo thứ tự cố định _đơn → thợ → lượt phân phối_ (không deadlock); client chỉ cập nhật store theo sự kiện/kết quả RPC.                                          |
| UI                       | Store `zustand` có chọn lọc, điều hướng **theo trạng thái** (một nơi duy nhất), danh sách `FlatList`, ảnh nén `quality 0.6`.                                                                                                                          |

---

## 11. Bảng ánh xạ đặc tả → mã nguồn

| Đặc tả                                                    | Vị trí                                                                                                                         |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Bảng dữ liệu (mục 7)                                      | `supabase/migrations/0001_schema.sql`                                                                                          |
| Sự kiện real-time (mục 5.3)                               | `0002_helpers.sql` (`_emit`), phát trong các RPC `0003–0005`; nhận ở `shared/mobile/hub.ts`, xử lý ở `shared/core/reducers.ts` |
| Chốt thợ nhất quán (5.2), BR-03/04                        | `select_mechanic` trong `0003_rpc_customer.sql`                                                                                |
| Phân phối (5.1), BR-01/14                                 | `get_dispatch_candidates`, `dispatch_insert` (`0004`), `supabase/functions/create-request`                                     |
| Phiếu & phiên bản (BR-07/08)                              | `submit_quote`, `confirm_quote`; hiển thị `shared/mobile/components/QuoteView.tsx`                                             |
| Hủy đơn (2.3)                                             | `cancel_order_by_customer`, `cancel_order_by_mechanic`; `shared/core/orderState.ts`                                            |
| Hồ sơ & duyệt (BR-16)                                     | `submit_mechanic_profile`, `admin_review_profile`                                                                              |
| Khoá thợ, khiếu nại                                       | `admin_set_lock`, `admin_resolve_report`, `admin_order_log` (`0005`)                                                           |
| AI Gemini (5.4)                                           | `supabase/functions/ai-assistant`                                                                                              |
| Chat Stream (5.5)                                         | `stream-token`, `stream-webhook`, `outbox-worker`; `shared/mobile/chat.tsx`                                                    |
| Màn hình U-xx / M-xx / A-xx                               | `fixgo-user/app/**`, `fixgo-mechanic/app/**`, `fixgo-admin/src/app/**`                                                         |
| Bảo mật (RLS, quyền hàm, Storage, Realtime Authorization) | `0006_security.sql`                                                                                                            |

**Quyết định kỹ thuật cần biết**

- Bucket `faces` và `request-media` là _public_ (đường dẫn UUID khó đoán) để hiển thị ảnh không tốn request ký URL; bucket **`cccd` riêng tư**: chỉ chính thợ và admin đọc được (signed URL).
- Chỉ **khách** gửi báo cáo (BR-10); đánh giá **không** trả về cho thợ (BR-17: chỉ điểm trung bình + số lượt).
- Mở rộng nhỏ ngoài đặc tả: thợ Online quá 30 phút không cập nhật vị trí sẽ không được phân phối (chống “Online ma”); Admin có thể **mở khoá** tài khoản; sự kiện `TRAVEL_STARTED`.

---

## 12. Xử lý sự cố thường gặp

| Triệu chứng                                        | Cách xử lý                                                                                                                                                                                                             |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Màn hình đăng nhập báo “Thiếu cấu hình môi trường” | Chưa có `.env` trong thư mục app hoặc chưa khởi động lại Metro: `npx expo start --dev-client -c`.                                                                                                                      |
| Không nhận email mã OTP                            | Kiểm tra App password Gmail, cổng 465, Rate Limits; xem **Authentication ▸ Logs**. Kiểm tra mẫu email đã có `{{ .Token }}`.                                                                                            |
| Đăng nhập Google/Facebook xong không quay lại app  | Thiếu Redirect URL (mục 3.3) hoặc sai _Authorized redirect URI_ (`…/auth/v1/callback`).                                                                                                                                |
| Build EAS lỗi Mapbox “401/403 download”            | Chưa khai báo `RNMAPBOX_MAPS_DOWNLOAD_TOKEN` (token `sk.` có scope `DOWNLOADS:READ`).                                                                                                                                  |
| `npx expo install --fix` đổi phiên bản             | Bình thường – để Expo chọn bản tương thích SDK. Chạy `npx expo-doctor` để kiểm tra.                                                                                                                                    |
| Thợ không nhận được yêu cầu                        | Thợ phải: hồ sơ **đã duyệt**, **Online**, chưa khoá, vị trí mới (< 30 phút), tuyến đường < 5 km, và **không đang có đơn**. Đặt GPS emulator gần nhau. Xem log hàm `create-request` (Supabase ▸ Edge Functions ▸ Logs). |
| Sự kiện real-time không tới                        | Kiểm tra đã chạy `0006_security.sql` (policy `realtime.messages`); mở **Realtime ▸ Inspector**. Kênh phải là _private_.                                                                                                |
| Chat báo “không kết nối được”                      | Kiểm tra 3 secret Stream, hàm `stream-token` đã deploy, `EXPO_PUBLIC_STREAM_API_KEY`.                                                                                                                                  |
| AI báo sự cố                                       | Kiểm tra `GEMINI_API_KEY`; có thể đổi model: `npx supabase secrets set GEMINI_MODEL=<tên model>`.                                                                                                                      |
| Thông báo đẩy không đến                            | Cần điện thoại thật + FCM (mục 7) + webhook `outbox` (mục 5).                                                                                                                                                          |
| Test backend đỏ                                    | Đảm bảo dùng project **thử** đã chạy đủ migration; gửi log để chỉnh.                                                                                                                                                   |

---

## 13. Giới hạn đã biết

- Theo dõi vị trí thợ chạy ở **foreground** (khi app mở). Chạy nền cần thêm `expo-task-manager` + quyền _background location_ (dễ mở rộng trong `shared/mobile/location.ts`).
- Facebook Login cần _App Review_ nếu muốn cho người dùng ngoài nhóm thử.
- Dẫn đường dùng Mapbox Directions (hiển thị chặng kế tiếp, không có giọng nói); chưa tích hợp Mapbox Navigation SDK.
- Test giao diện tự động (Maestro/Detox) chưa có – kiểm tra giao diện theo checklist mục 9.

---

## 14. Cấu trúc thư mục

```
fixgo/
├─ README.md
├─ package.json · vitest.config.ts       # chạy kiểm thử
├─ scripts/                              # sync-shared.mjs, build-setup-sql.mjs
├─ shared/
│  ├─ core/                              # TypeScript thuần (types, quote, geo, validation, routing, reducers…)
│  └─ mobile/                            # React Native dùng chung (UI, auth, hub real-time, maps, chat…)
├─ supabase/
│  ├─ migrations/0001…0006.sql  · setup_all.sql
│  ├─ functions/ (create-request, ai-assistant, stream-token, stream-webhook, outbox-worker, _shared)
│  └─ config.toml
├─ fixgo-user/       # App Khách   (src/shared = bản sao của shared/)
├─ fixgo-mechanic/   # App Thợ
├─ fixgo-admin/      # Admin Next.js
└─ tests/
   ├─ core/          # 113 test logic (chạy được ngay)
   └─ backend/       # test tích hợp trên Supabase thật
```

Sau khi sửa `shared/`, chạy `npm run sync` (hoặc `npm start` trong app) để chép vào các ứng dụng.
