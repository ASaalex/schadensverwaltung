import { supabase, auxAuthClient } from './supabase';
import type {
  UserRole,
  CompanyType,
  GeometryType,
  Priority,
  PropertyFieldDef,
} from '@/types/database';

// =============================================================================
//  NUTZER
// =============================================================================

export interface CreateUserInput {
  email: string;
  password: string;
  full_name: string;
  phone: string | null;
  role: UserRole;
  company_id: string;
}

export interface CreateUserResult {
  user_id: string;
  email: string;
  password: string;
  email_confirmation_pending: boolean;
}

/**
 * Legt einen neuen Auth-User + public.users-Profil an.
 *
 * Da die Frontend-App nicht den Service-Role-Key hat, nutzen wir signUp().
 * Die laufende Admin-Session wird vor signUp gesichert und danach
 * wiederhergestellt (sonst wäre der Admin ausgeloggt).
 *
 * Der Admin gibt das Initial-Passwort selbst vor — der neue Nutzer kann
 * es später über "Passwort vergessen" oder die Profil-Seite ändern.
 */
export async function createUser(input: CreateUserInput): Promise<CreateUserResult> {
  // signUp auf dem AUX-Client — der hat persistSession=false, ändert die
  // Admin-Session also NICHT. Kein onAuthStateChange-Race im Haupt-Client.
  // eslint-disable-next-line no-console
  console.log('[createUser] signUp via aux client …');
  const { data: signUpData, error: signUpErr } = await auxAuthClient.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      emailRedirectTo: `${window.location.origin}/login`,
    },
  });
  if (signUpErr) {
    // eslint-disable-next-line no-console
    console.error('[createUser] signUp-Fehler:', signUpErr);
    throw new Error(`Auth-Anlegen fehlgeschlagen: ${signUpErr.message}`);
  }

  // Supabase-Anti-Enumeration: bei bereits existierender E-Mail kommt user
  // mit leerem identities-Array zurück
  if (signUpData.user && Array.isArray(signUpData.user.identities) && signUpData.user.identities.length === 0) {
    throw new Error(
      `Die E-Mail-Adresse "${input.email}" ist bereits registriert. ` +
        `Lösche den Auth-User im Supabase Dashboard (Authentication → Users) ` +
        `oder verknüpfe das Profil manuell in public.users.`,
    );
  }

  if (!signUpData.user) {
    throw new Error(
      'Supabase hat keinen User zurückgegeben. Prüfe Supabase-Dashboard ' +
        '→ Authentication → Users (E-Mail evtl. schon vorhanden) und ' +
        '→ Settings → Sign Ups (aktiviert?).',
    );
  }
  const newUserId = signUpData.user.id;
  const emailConfirmationPending = !signUpData.session && !signUpData.user.email_confirmed_at;
  // eslint-disable-next-line no-console
  console.log('[createUser] Auth-User OK, ID:', newUserId);

  // INSERT in public.users über den HAUPT-Client (= Admin-Session, RLS klappt)
  const { error: insErr } = await supabase.from('users').insert({
    id: newUserId,
    company_id: input.company_id,
    role: input.role,
    full_name: input.full_name.trim(),
    phone: input.phone?.trim() || null,
    active: true,
  } as never);
  if (insErr) {
    // eslint-disable-next-line no-console
    console.error('[createUser] users-INSERT-Fehler:', insErr);
    throw new Error(
      `Profil-Anlegen fehlgeschlagen: ${insErr.message}. Auth-User (ID ${newUserId}) bleibt bestehen.`,
    );
  }
  // eslint-disable-next-line no-console
  console.log('[createUser] Profil angelegt');

  return {
    user_id: newUserId,
    email: input.email,
    password: input.password,
    email_confirmation_pending: emailConfirmationPending,
  };
}

export interface UpdateUserInput {
  full_name?: string;
  phone?: string | null;
  role?: UserRole;
  company_id?: string;
  active?: boolean;
}

export async function updateUser(userId: string, patch: UpdateUserInput): Promise<void> {
  const cleaned: Record<string, unknown> = {};
  if (patch.full_name !== undefined) cleaned.full_name = patch.full_name.trim();
  if (patch.phone !== undefined) cleaned.phone = patch.phone?.trim() || null;
  if (patch.role !== undefined) cleaned.role = patch.role;
  if (patch.company_id !== undefined) cleaned.company_id = patch.company_id;
  if (patch.active !== undefined) cleaned.active = patch.active;
  const { error } = await supabase.from('users').update(cleaned as never).eq('id', userId);
  if (error) throw new Error(`Nutzer aktualisieren fehlgeschlagen: ${error.message}`);
}

/**
 * Löscht das Profil aus public.users.
 * Hinweis: der zugehörige Auth-User in auth.users bleibt bestehen (das geht
 * nur über die service_role-API, die wir im Frontend nicht haben). Der User
 * kann sich noch anmelden, sieht dann den "Kein-Profil"-Screen.
 */
export async function deleteUserProfile(userId: string): Promise<void> {
  const { error } = await supabase.from('users').delete().eq('id', userId);
  if (error) throw new Error(`Nutzer-Profil löschen fehlgeschlagen: ${error.message}`);
}

export interface UpdateCompanyInput {
  name?: string;
  type?: CompanyType;
  contact_email?: string | null;
  contact_phone?: string | null;
  address?: string | null;
  active?: boolean;
}

export async function updateCompany(id: string, patch: UpdateCompanyInput): Promise<void> {
  const cleaned: Record<string, unknown> = {};
  if (patch.name !== undefined) cleaned.name = patch.name.trim();
  if (patch.type !== undefined) cleaned.type = patch.type;
  if (patch.contact_email !== undefined) cleaned.contact_email = patch.contact_email?.trim() || null;
  if (patch.contact_phone !== undefined) cleaned.contact_phone = patch.contact_phone?.trim() || null;
  if (patch.address !== undefined) cleaned.address = patch.address?.trim() || null;
  if (patch.active !== undefined) cleaned.active = patch.active;
  const { error } = await supabase.from('companies').update(cleaned as never).eq('id', id);
  if (error) throw new Error(`Firma aktualisieren fehlgeschlagen: ${error.message}`);
}

/** Generator für ein zufälliges, ausreichend starkes Passwort. */
export function generatePassword(len = 14): string {
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const digit = '23456789';
  const symbol = '!@#$%&*?';
  const all = lower + upper + digit + symbol;
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  let out = '';
  out += lower[arr[0] % lower.length];
  out += upper[arr[1] % upper.length];
  out += digit[arr[2] % digit.length];
  out += symbol[arr[3] % symbol.length];
  for (let i = 4; i < len; i++) out += all[arr[i] % all.length];
  return out
    .split('')
    .sort(() => Math.random() - 0.5)
    .join('');
}

// =============================================================================
//  FIRMEN
// =============================================================================

export interface CreateCompanyInput {
  name: string;
  type: CompanyType;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
}

export async function createCompany(input: CreateCompanyInput): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from('companies')
    .insert({
      name: input.name.trim(),
      type: input.type,
      contact_email: input.contact_email?.trim() || null,
      contact_phone: input.contact_phone?.trim() || null,
      address: input.address?.trim() || null,
      active: true,
    } as never)
    .select('id')
    .single();
  if (error) throw new Error(`Firma anlegen fehlgeschlagen: ${error.message}`);
  return { id: (data as unknown as { id: string }).id };
}

export async function updateCompanyActive(id: string, active: boolean): Promise<void> {
  const { error } = await supabase.from('companies').update({ active } as never).eq('id', id);
  if (error) throw new Error(`Firma aktualisieren fehlgeschlagen: ${error.message}`);
}

// =============================================================================
//  KATEGORIEN
// =============================================================================

export interface CreateCategoryInput {
  parent_id: string | null;
  name: string;
  code: string | null;
  /** Erlaubte Geometrie-Typen (mind. 1). Der DB-Trigger setzt geometry_type aus [0]. */
  geometry_types: GeometryType[];
  default_priority: Priority | null;
  default_company_id: string | null;
  property_schema: PropertyFieldDef[];
}

export async function createCategory(
  companyId: string,
  input: CreateCategoryInput,
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from('damage_categories')
    .insert({
      company_id: companyId,
      parent_id: input.parent_id,
      name: input.name.trim(),
      code: input.code?.trim() || null,
      geometry_types: input.geometry_types.length > 0 ? input.geometry_types : ['point'],
      default_priority: input.default_priority,
      default_company_id: input.default_company_id,
      property_schema: input.property_schema,
      sort_order: 0,
      active: true,
    } as never)
    .select('id')
    .single();
  if (error) throw new Error(`Kategorie anlegen fehlgeschlagen: ${error.message}`);
  return { id: (data as unknown as { id: string }).id };
}

export interface UpdateCategoryInput extends Partial<CreateCategoryInput> {
  active?: boolean;
  sort_order?: number;
}

export async function updateCategory(id: string, patch: UpdateCategoryInput): Promise<void> {
  const cleaned: Record<string, unknown> = {};
  if (patch.name !== undefined) cleaned.name = patch.name.trim();
  if (patch.code !== undefined) cleaned.code = patch.code?.trim() || null;
  if (patch.geometry_types !== undefined) {
    cleaned.geometry_types = patch.geometry_types.length > 0 ? patch.geometry_types : ['point'];
  }
  if (patch.default_priority !== undefined) cleaned.default_priority = patch.default_priority;
  if (patch.default_company_id !== undefined) cleaned.default_company_id = patch.default_company_id;
  if (patch.property_schema !== undefined) cleaned.property_schema = patch.property_schema;
  if (patch.parent_id !== undefined) cleaned.parent_id = patch.parent_id;
  if (patch.active !== undefined) cleaned.active = patch.active;
  if (patch.sort_order !== undefined) cleaned.sort_order = patch.sort_order;
  const { error } = await supabase
    .from('damage_categories')
    .update(cleaned as never)
    .eq('id', id);
  if (error) throw new Error(`Kategorie aktualisieren fehlgeschlagen: ${error.message}`);
}

export async function deleteCategory(id: string): Promise<void> {
  // Wir LÖSCHEN nicht hart (Schäden referenzieren das), sondern deaktivieren.
  await updateCategory(id, { active: false });
}
