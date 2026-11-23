// Kiểu dữ liệu dùng chung giữa app Khách, app Thợ, Admin và kiểm thử.
// Hình dạng JSON khớp với các hàm RPC trong supabase/migrations.

export type OrderStatus =
  | 'searching' | 'selected' | 'traveling' | 'arrived' | 'quote_pending'
  | 'repairing' | 'awaiting_payment' | 'completed' | 'cancelled';
export type ReviewStatus = 'none' | 'skipped' | 'submitted';
export type ProfileStatus = 'none' | 'pending' | 'approved' | 'rejected';
export type AccountStatus = 'active' | 'locked';
export type Presence = 'online' | 'offline';
export type DispatchStatus = 'sent' | 'accepted' | 'declined' | 'proposed' | 'removed';
export type QuoteStatus = 'sent' | 'confirmed' | 'superseded';
export type LineKind = 'task' | 'part';
export type CancelParty = 'customer' | 'mechanic';

export interface Media { path: string; type: 'image' | 'video' }

export interface MechanicPublic {
  id: string;
  full_name: string | null;
  face_photo: string | null;
  rating_avg: number;
  rating_count: number;
  completed_count: number;
}

export interface ProposalDTO {
  id: string;
  order_id: string;
  mechanic: MechanicPublic;
  assessment: string;
  price_min: number;
  price_max: number;
  eta_minutes: number;
  status: 'available' | 'unavailable';
  created_at: string;
}

export interface SelectedProposal {
  id: string; assessment: string; price_min: number; price_max: number; eta_minutes: number;
}

export interface OrderDTO {
  id: string;
  status: OrderStatus;
  customer_id: string;
  mechanic_id: string | null;
  lat: number;
  lng: number;
  address: string;
  incident_types: string[];
  vehicle_model: string;
  license_plate: string;
  description: string;
  media: Media[];
  created_at: string;
  selected_at: string | null;
  completed_at: string | null;
  cancelled_by: CancelParty | null;
  cancel_reason: string | null;
  review_status: ReviewStatus;
  current_quote_version: number;
  customer: { id: string; full_name: string | null } | null;
  mechanic: MechanicPublic | null;
  proposal: SelectedProposal | null;
}

export interface QuoteLine {
  line_key: string;
  kind: LineKind;
  name: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

export interface QuoteDTO {
  id: string;
  order_id: string;
  version: number;
  diagnosis: string;
  status: QuoteStatus;
  total: number;
  sent_at: string;
  confirmed_at: string | null;
  lines: QuoteLine[];
}

export interface DispatchOrderSummary {
  id: string; lat: number; lng: number; address: string; incident_types: string[];
  vehicle_model: string; license_plate: string; description: string; media: Media[]; created_at: string;
}

export interface AiResult {
  summary: string;
  diagnosis: string[];
  toolkit: { tools: string[]; equipment: string[]; parts: string[] };
}

export interface ProposalDraft { assessment?: string; price_min?: string; price_max?: string; eta_minutes?: string }

export interface DispatchItem {
  order_id: string;
  status: DispatchStatus;
  route_distance_m: number;
  draft: ProposalDraft | null;
  ai_result: AiResult | null;
  created_at: string;
  order: DispatchOrderSummary;
}

export interface MechanicSelf {
  id: string;
  email: string | null;
  provider: string;
  profile_status: ProfileStatus;
  account_status: AccountStatus;
  presence: Presence;
  face_photo: string | null;
  full_name: string | null;
  phone: string | null;
  birth_date: string | null;
  skills: string[];
  experience: string | null;
  id_full_name: string | null;
  id_number: string | null;
  id_front: string | null;
  id_back: string | null;
  pending_changes: MechanicProfileInput | null;
  review_note: string | null;
  rating_avg: number;
  rating_count: number;
  completed_count: number;
}

export interface MechanicProfileInput {
  face_photo: string;
  full_name: string;
  phone: string;
  birth_date: string; // YYYY-MM-DD
  skills: string[];
  experience?: string | null;
  id_full_name: string;
  id_number: string;
  id_front: string;
  id_back: string;
}

export interface CustomerSelf { id: string; full_name: string | null; email: string | null; provider: string }

export interface CustomerState {
  order: OrderDTO | null;
  proposals: ProposalDTO[];
  accepted_count: number;
  quotes: QuoteDTO[]; // mới nhất trước
}

export interface MechanicState {
  mechanic: MechanicSelf;
  dispatches: DispatchItem[];
  order: OrderDTO | null;
  quotes: QuoteDTO[];
}

export interface HistoryItem {
  id: string;
  status: OrderStatus;
  created_at: string;
  incident_types: string[];
  review_status: ReviewStatus;
  cancelled_by: CancelParty | null;
  mechanic_name: string | null;
  customer_name?: string | null;
  needs_review: boolean;
}

export interface OrderDetail {
  order: OrderDTO;
  quote: QuoteDTO | null;
  review: { stars: number; comment: string | null; created_at: string } | null;
}

export interface LatLng { lat: number; lng: number }
