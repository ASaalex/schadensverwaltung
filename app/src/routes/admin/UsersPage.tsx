import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/layout/AppShell';
import { Modal } from '@/components/ui/Modal';
import { supabase } from '@/lib/supabase';
import { createUser, updateUser, deleteUserProfile, generatePassword } from '@/lib/adminActions';
import { useCompanies } from '@/hooks/useCompanies';
import { useAuth } from '@/auth/AuthContext';
import { ADMIN_SIDEBAR } from './sidebar';
import {
  UserPlus, Loader2, AlertCircle, CheckCircle2, Copy, Eye, EyeOff, Wand2,
  Edit3, Trash2,
} from 'lucide-react';
import type { UserRole } from '@/types/database';

interface UserRow {
  id: string;
  full_name: string;
  role: UserRole;
  active: boolean;
  created_at: string;
  company_id: string;
  phone: string | null;
  company_name?: string;
}

async function fetchUsers(): Promise<UserRow[]> {
  const { data, error } = await supabase
    .from('users')
    .select('id, full_name, role, active, created_at, company_id, phone, company:companies!company_id ( name )')
    .order('full_name');
  if (error) throw error;
  const rows = (data ?? []) as unknown as Array<UserRow & { company: { name: string } | null }>;
  return rows.map((u) => ({ ...u, company_name: u.company?.name }));
}

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'admin', label: 'Administrator' },
  { value: 'dispatcher', label: 'Disponent' },
  { value: 'field_worker', label: 'Erfasser' },
  { value: 'company_user', label: 'Firmen-Nutzer (extern)' },
];

export function AdminUsersPage() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ['admin-users'], queryFn: fetchUsers });
  const { data: companies = [] } = useCompanies();

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    email: '',
    password: '',
    full_name: '',
    phone: '',
    role: 'field_worker' as UserRole,
    company_id: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [createdInfo, setCreatedInfo] = useState<{
    email: string;
    password: string;
    email_confirmation_pending: boolean;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // Edit-Modus
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [editForm, setEditForm] = useState({ full_name: '', phone: '', role: 'field_worker' as UserRole, company_id: '', active: true });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  // Delete
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState<UserRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  function openEdit(u: UserRow) {
    setEditing(u);
    setEditForm({
      full_name: u.full_name,
      phone: u.phone ?? '',
      role: u.role,
      company_id: u.company_id,
      active: u.active,
    });
    setEditError(null);
    setEditOpen(true);
  }

  async function handleEditSave() {
    if (!editing) return;
    setEditError(null);
    if (!editForm.full_name.trim()) {
      setEditError('Name ist Pflicht.');
      return;
    }
    setEditSaving(true);
    try {
      await updateUser(editing.id, {
        full_name: editForm.full_name,
        phone: editForm.phone,
        role: editForm.role,
        company_id: editForm.company_id,
        active: editForm.active,
      });
      await qc.invalidateQueries({ queryKey: ['admin-users'] });
      setEditOpen(false);
    } catch (e) {
      setEditError((e as Error).message);
    } finally {
      setEditSaving(false);
    }
  }

  async function toggleActive(u: UserRow) {
    try {
      await updateUser(u.id, { active: !u.active });
      await qc.invalidateQueries({ queryKey: ['admin-users'] });
    } catch (e) {
      alert((e as Error).message);
    }
  }

  function openDelete(u: UserRow) {
    setDeleting(u);
    setDeleteOpen(true);
  }
  async function handleDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await deleteUserProfile(deleting.id);
      await qc.invalidateQueries({ queryKey: ['admin-users'] });
      setDeleteOpen(false);
      setDeleting(null);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setDeleteBusy(false);
    }
  }

  function openModal() {
    setForm({
      email: '',
      password: generatePassword(),
      full_name: '',
      phone: '',
      role: 'field_worker',
      company_id: profile?.company_id ?? companies[0]?.id ?? '',
    });
    setShowPassword(false);
    setSaveError(null);
    setCreatedInfo(null);
    setModalOpen(true);
  }

  async function handleCreate() {
    setSaveError(null);
    if (!form.email.trim() || !form.full_name.trim()) {
      setSaveError('E-Mail und Name sind Pflichtfelder.');
      return;
    }
    if (form.password.length < 8) {
      setSaveError('Das Passwort muss mindestens 8 Zeichen lang sein.');
      return;
    }
    if (!form.company_id) {
      setSaveError('Bitte eine Firma wählen.');
      return;
    }
    setSaving(true);
    try {
      const res = await createUser({
        email: form.email.trim(),
        password: form.password,
        full_name: form.full_name,
        phone: form.phone,
        role: form.role,
        company_id: form.company_id,
      });
      setCreatedInfo({
        email: res.email,
        password: res.password,
        email_confirmation_pending: res.email_confirmation_pending,
      });
      await qc.invalidateQueries({ queryKey: ['admin-users'] });
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function copyPassword() {
    if (!createdInfo) return;
    navigator.clipboard.writeText(createdInfo.password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <AppShell title="Administration" subtitle="Nutzerverwaltung" accent="slate" sidebar={ADMIN_SIDEBAR}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-2xl font-semibold">Nutzer</h2>
          <p className="text-sm text-muted-foreground">{data?.length ?? 0} Einträge</p>
        </div>
        <button
          onClick={openModal}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <UserPlus className="h-4 w-4" /> Neuer Nutzer
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {(error as Error).message}
        </div>
      )}

      {/* Mobile Karten (< md) */}
      <div className="space-y-2 md:hidden">
        {isLoading && <div className="text-center text-sm text-muted-foreground">Lade …</div>}
        {!isLoading && data?.length === 0 && (
          <div className="rounded-xl border bg-white p-4 text-center text-sm text-muted-foreground">
            Noch keine Nutzer.
          </div>
        )}
        {data?.map((u) => (
          <div key={u.id} className="rounded-xl border bg-white p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{u.full_name}</div>
                <div className="truncate text-xs text-muted-foreground">{u.company_name ?? '—'}</div>
              </div>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{u.role}</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs">
              <button
                onClick={() => toggleActive(u)}
                className={`flex items-center gap-1 rounded-full px-2 py-0.5 ${
                  u.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${u.active ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                {u.active ? 'aktiv' : 'inaktiv'}
              </button>
              <div className="flex gap-1">
                <button onClick={() => openEdit(u)} className="rounded p-1.5 text-slate-500 hover:bg-slate-100" title="Bearbeiten">
                  <Edit3 className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => openDelete(u)} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Löschen">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop Tabelle (≥ md) */}
      <div className="hidden overflow-hidden rounded-xl border bg-white md:block">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 text-left">Name</th>
              <th className="px-4 py-2.5 text-left">Rolle</th>
              <th className="px-4 py-2.5 text-left">Firma</th>
              <th className="px-4 py-2.5 text-left">Status</th>
              <th className="px-4 py-2.5 text-left">Angelegt</th>
              <th className="w-20 px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">Lade …</td></tr>
            )}
            {!isLoading && data?.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">Noch keine Nutzer.</td></tr>
            )}
            {data?.map((u) => (
              <tr key={u.id} className="group">
                <td className="px-4 py-3 font-medium">{u.full_name}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{u.role}</span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{u.company_name ?? '—'}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => toggleActive(u)}
                    className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
                      u.active ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                    title={u.active ? 'Klick zum Deaktivieren' : 'Klick zum Aktivieren'}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${u.active ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                    {u.active ? 'aktiv' : 'inaktiv'}
                  </button>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {new Date(u.created_at).toLocaleDateString('de-DE')}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button onClick={() => openEdit(u)} className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-blue-600" title="Bearbeiten">
                      <Edit3 className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => openDelete(u)} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Löschen">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ============ NEUER-NUTZER-MODAL ============ */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Neuer Nutzer"
        description="Auth-Account anlegen + Profil verknüpfen"
        size="md"
      >
        {createdInfo ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-600" />
              <div>
                <div className="font-medium text-emerald-900">Nutzer angelegt</div>
                <div className="mt-1 text-sm text-emerald-800">
                  Teile die Login-Daten mit dem neuen Nutzer. Er kann das Passwort später ändern.
                </div>
              </div>
            </div>
            <div className="rounded-lg border bg-slate-50 p-3 text-sm">
              <div className="mb-1 text-xs text-slate-500">E-Mail</div>
              <div className="break-all font-mono">{createdInfo.email}</div>
              <div className="mt-3 mb-1 text-xs text-slate-500">Passwort</div>
              <div className="flex items-center gap-2">
                <code className="flex-1 break-all rounded bg-white px-2 py-1.5 font-mono text-sm">
                  {createdInfo.password}
                </code>
                <button
                  onClick={copyPassword}
                  className="flex items-center gap-1 rounded bg-slate-200 px-2 py-1.5 text-xs hover:bg-slate-300"
                >
                  <Copy className="h-3 w-3" />
                  {copied ? 'kopiert' : 'kopieren'}
                </button>
              </div>
            </div>
            {createdInfo.email_confirmation_pending && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                ⚠️ In deinem Supabase-Projekt ist E-Mail-Bestätigung aktiv. Der neue Nutzer
                bekommt eine Mail und muss den Bestätigungs-Link klicken, bevor er sich einloggen kann.
              </div>
            )}
            <div className="flex justify-end">
              <button
                onClick={() => setModalOpen(false)}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white"
              >
                Schließen
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {saveError && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                {saveError}
              </div>
            )}
            <Field label="E-Mail">
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="vorname.nachname@erfurt.de"
                className="w-full rounded-lg border px-3 py-2 text-sm"
                autoFocus
              />
            </Field>
            <Field label="Voller Name">
              <input
                type="text"
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                placeholder="Anna Berger"
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Telefon (optional)">
              <input
                type="text"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Passwort">
              <div className="flex gap-1">
                <div className="relative flex-1">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder="mind. 8 Zeichen"
                    className="w-full rounded-lg border px-3 py-2 pr-9 font-mono text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-1 top-1 rounded p-1.5 text-slate-400 hover:bg-slate-100"
                    title={showPassword ? 'Verbergen' : 'Anzeigen'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setForm({ ...form, password: generatePassword() });
                    setShowPassword(true);
                  }}
                  className="flex items-center gap-1 rounded-lg border bg-white px-3 py-2 text-xs hover:bg-slate-50"
                  title="Neues Passwort generieren"
                >
                  <Wand2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Der Nutzer kann es nach dem ersten Login selbst ändern.
              </div>
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Rolle">
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Firma">
                <select
                  value={form.company_id}
                  onChange={(e) => setForm({ ...form, company_id: e.target.value })}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                >
                  <option value="">— wählen —</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.type === 'internal_bauhof' ? '(intern)' : '(extern)'}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setModalOpen(false)}
                className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50"
                disabled={saving}
              >
                Abbrechen
              </button>
              <button
                onClick={handleCreate}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Anlegen
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ============ EDIT-MODAL ============ */}
      <Modal open={editOpen} onClose={() => !editSaving && setEditOpen(false)} title="Nutzer bearbeiten" size="md">
        <div className="space-y-3">
          {editError && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" /> {editError}
            </div>
          )}
          <Field label="Voller Name">
            <input
              type="text"
              value={editForm.full_name}
              onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              autoFocus
            />
          </Field>
          <Field label="Telefon (optional)">
            <input
              type="text"
              value={editForm.phone}
              onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Rolle">
              <select
                value={editForm.role}
                onChange={(e) => setEditForm({ ...editForm, role: e.target.value as UserRole })}
                className="w-full rounded-lg border px-3 py-2 text-sm"
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Firma">
              <select
                value={editForm.company_id}
                onChange={(e) => setEditForm({ ...editForm, company_id: e.target.value })}
                className="w-full rounded-lg border px-3 py-2 text-sm"
              >
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.type === 'internal_bauhof' ? '(intern)' : '(extern)'}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={editForm.active}
              onChange={(e) => setEditForm({ ...editForm, active: e.target.checked })}
              className="h-4 w-4"
            />
            Aktiv (Nutzer darf sich einloggen / Profil sichtbar)
          </label>
          <div className="rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
            E-Mail kann hier nicht geändert werden — falls nötig, lösche das Profil und lege es mit
            der neuen E-Mail neu an, oder ändere es im Supabase Dashboard.
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setEditOpen(false)} disabled={editSaving} className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50">
              Abbrechen
            </button>
            <button
              onClick={handleEditSave}
              disabled={editSaving}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {editSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              Speichern
            </button>
          </div>
        </div>
      </Modal>

      {/* ============ DELETE-BESTÄTIGUNG ============ */}
      <Modal open={deleteOpen} onClose={() => !deleteBusy && setDeleteOpen(false)} title="Nutzer-Profil löschen" size="md">
        <div className="space-y-3">
          <p className="text-sm">
            Profil von <strong>{deleting?.full_name}</strong> wirklich löschen?
          </p>
          <ul className="ml-4 list-disc text-sm text-slate-600">
            <li>Eintrag aus <code>public.users</code> wird entfernt</li>
            <li>Auth-Account in <code>auth.users</code> bleibt bestehen — bei erneutem Login
              sieht die Person den "Kein-Profil"-Bildschirm</li>
            <li>Zum vollständigen Löschen den User danach im Supabase-Dashboard löschen</li>
          </ul>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setDeleteOpen(false)} disabled={deleteBusy} className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50">
              Abbrechen
            </button>
            <button
              onClick={handleDelete}
              disabled={deleteBusy}
              className="flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {deleteBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Profil löschen
            </button>
          </div>
        </div>
      </Modal>
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs uppercase tracking-wider text-slate-500">{label}</span>
      {children}
    </label>
  );
}
