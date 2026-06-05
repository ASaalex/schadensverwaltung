// =============================================================================
//  Database-Types (handgepflegt; später durch `supabase gen types typescript`
//  ersetzbar — bis dahin synchron mit der Migration in supabase/migrations/).
// =============================================================================

export type UserRole = 'admin' | 'dispatcher' | 'field_worker' | 'company_user';
export type CompanyType = 'internal_bauhof' | 'external_company';
export type DamageStatus = 'neu' | 'geprueft' | 'zugewiesen' | 'bearbeitung' | 'erledigt' | 'abgelehnt';
export type Priority = 'niedrig' | 'normal' | 'hoch' | 'dringend';
export type GeometryType = 'point' | 'line' | 'polygon';
export type PhotoType = 'before' | 'after' | 'detail';
export type OrderStatus =
  | 'entwurf' | 'versendet' | 'angenommen' | 'bearbeitung' | 'fertiggemeldet' | 'abgeschlossen' | 'storniert';
export type PositionStatus = 'offen' | 'bearbeitung' | 'erledigt' | 'uebersprungen';

export type FieldType = 'text' | 'number' | 'decimal' | 'select' | 'boolean' | 'date';

export interface PropertyFieldDef {
  name: string;
  label: string;
  field_type: FieldType;
  unit?: string;
  required?: boolean;
  options?: string[];
}

export interface Company {
  id: string;
  name: string;
  type: CompanyType;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  logo_path: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserProfile {
  id: string;
  company_id: string;
  role: UserRole;
  full_name: string;
  phone: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DamageCategory {
  id: string;
  company_id: string;
  parent_id: string | null;
  name: string;
  code: string | null;
  description: string | null;
  sort_order: number;
  /** Primärer Geometrie-Typ (= geometry_types[0]) — bleibt für Backward-Compat */
  geometry_type: GeometryType;
  /** Alle erlaubten Geometrie-Typen. Wenn mehr als einer, kann der Erfasser wählen. */
  geometry_types: GeometryType[];
  property_schema: PropertyFieldDef[];
  default_priority: Priority | null;
  default_company_id: string | null;
  /** Verknüpfte Netz-Objekttypen (für Objekt-Suggestion im Wizard) */
  object_type_ids: string[];
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Damage {
  id: string;
  company_id: string;
  code: string;
  category_id: string;
  status: DamageStatus;
  priority: Priority;
  gps_lat: number | null;
  gps_lng: number | null;
  gps_accuracy_m: number | null;
  geometry: unknown | null; // GeoJSON
  property_values: Record<string, unknown>;
  address_street: string | null;
  address_house_number: string | null;
  address_postal_code: string | null;
  address_city: string | null;
  address_resolved_at: string | null;
  description: string | null;
  created_by: string | null;
  created_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  updated_at: string;
  /** Netz-Objekt-Bezug */
  network_object_id: string | null;
  /** ASB-Netzreferenz */
  netz_segment_id: string | null;
  netz_station_m: number | null;
  netz_offset_m: number | null;
  netz_abstand_m: number | null;
  netz_referenz: string | null;
}

export interface Order {
  id: string;
  company_id: string;
  code: string;
  title: string;
  description: string | null;
  assigned_company_id: string;
  status: OrderStatus;
  planned_start_date: string | null;
  planned_end_date: string | null;
  created_by: string | null;
  created_at: string;
  sent_at: string | null;
  accepted_at: string | null;
  fertiggemeldet_at: string | null;
  completed_at: string | null;
  updated_at: string;
}

export interface MapLayer {
  id: string;
  company_id: string;
  name: string;
  type: 'xyz' | 'wms' | 'wmts';
  url_template: string;
  attribution: string | null;
  min_zoom: number;
  max_zoom: number;
  is_default: boolean;
  enabled: boolean;
  sort_order: number;
  created_at: string;
}

// Minimal Database-Interface für supabase-js-Typing
export interface Database {
  public: {
    Tables: {
      companies: { Row: Company; Insert: Partial<Company>; Update: Partial<Company> };
      users: { Row: UserProfile; Insert: Partial<UserProfile>; Update: Partial<UserProfile> };
      damage_categories: { Row: DamageCategory; Insert: Partial<DamageCategory>; Update: Partial<DamageCategory> };
      damages: { Row: Damage; Insert: Partial<Damage>; Update: Partial<Damage> };
      orders: { Row: Order; Insert: Partial<Order>; Update: Partial<Order> };
      map_layers: { Row: MapLayer; Insert: Partial<MapLayer>; Update: Partial<MapLayer> };
    };
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
