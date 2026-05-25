import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/layout/AppShell';
import { Modal } from '@/components/ui/Modal';
import { supabase } from '@/lib/supabase';
import { createCompany, updateCompany, updateCompanyActive } from '@/lib/adminActions';
import { ADMIN_SIDEBAR } from './sidebar';
import { Building2, User, Mail, Plus, Loader2, AlertCircle, Edit3 } from 'lucide-react';
import type { CompanyType } from '@/types/database';

interface Row {
  id: string;
  name: string;
  type: 'internal_bauhof' | 'external_company';
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  active: boolean;
}

async function fetchCompanies(): Promise<Row[]> {
  const { data, error } = await supabase
    .from('companies')
    .select('id, name, type, contact_email, contact_phone, address, active')
    .order('type')
    .order('name');
  if (error) throw error;
  return (data ?? []) as unknown as Row[];
}

export function AdminCompaniesPage() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ['admin-companies'], queryFn: fetchCompanies });

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    type: 'external_company' as CompanyType,
    contact_email: '',
    contact_phone: '',
    address: '',
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  function openCreate() {
    setEditingId(null);
    setForm({ name: '', type: 'external_company', contact_email: '', contact_phone: '', address: '' });
    setSaveError(null);
    setModalOpen(true);
  }

  function openEdit(c: Row) {
    setEditingId(c.id);
    setForm({
      name: c.name,
      type: c.type,
      contact_email: c.contact_email ?? '',
      contact_phone: c.contact_phone ?? '',
      address: c.address ?? '',
    });
    setSaveError(null);
    setModalOpen(true);
  }

  async function handleSave() {
    setSaveError(null);
    if (!form.name.trim()) {
      setSaveError('Name ist Pflicht.');
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await updateCompany(editingId, {
          name: form.name,
          type: form.type,
          contact_email: form.contact_email || null,
          contact_phone: form.contact_phone || null,
          address: form.address || null,
        });
      } else {
        await createCompany({
          name: form.name,
          type: form.type,
          contact_email: form.contact_email || null,
          contact_phone: form.contact_phone || null,
          address: form.address || null,
        });
      }
      await qc.invalidateQueries({ queryKey: ['admin-companies'] });
      await qc.invalidateQueries({ queryKey: ['companies'] });
      setModalOpen(false);
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(id: string, active: boolean) {
    try {
      await updateCompanyActive(id, active);
      await qc.invalidateQueries({ queryKey: ['admin-companies'] });
      await qc.invalidateQueries({ queryKey: ['companies'] });
    } catch (e) {
      alert((e as Error).message);
    }
  }

  return (
    <AppShell title="Administration" subtitle="Firmen" accent="slate" sidebar={ADMIN_SIDEBAR}>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Firmen</h2>
          <p className="text-sm text-muted-foreground">{data?.length ?? 0} Einträge</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" /> Neue Firma
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {(error as Error).message}
        </div>
      )}

      {isLoading && <div className="text-sm text-muted-foreground">Lade …</div>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {data?.map((c) => (
          <div key={c.id} className="rounded-xl border bg-white p-4">
            <div className="mb-3 flex items-start justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-slate-400" />
                <div>
                  <div className="font-semibold">{c.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {c.type === 'internal_bauhof' ? 'Intern (Bauhof)' : 'Externer Dienstleister'}
                  </div>
                </div>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${
                  c.type === 'internal_bauhof' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
                }`}
              >
                {c.type === 'internal_bauhof' ? 'intern' : 'extern'}
              </span>
            </div>
            <div className="space-y-1 text-sm text-slate-600">
              {c.contact_email && (
                <div className="flex items-center gap-2">
                  <Mail className="h-3.5 w-3.5" /> {c.contact_email}
                </div>
              )}
              {c.address && (
                <div className="flex items-center gap-2">
                  <User className="h-3.5 w-3.5" /> {c.address}
                </div>
              )}
            </div>
            <div className="mt-3 flex items-center justify-between border-t pt-2 text-xs">
              {c.active ? (
                <span className="flex items-center gap-1 text-emerald-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> aktiv
                </span>
              ) : (
                <span className="flex items-center gap-1 text-slate-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-400" /> inaktiv
                </span>
              )}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => openEdit(c)}
                  className="flex items-center gap-1 text-blue-600 hover:underline"
                >
                  <Edit3 className="h-3 w-3" /> Bearbeiten
                </button>
                <button
                  onClick={() => toggleActive(c.id, !c.active)}
                  className="text-slate-500 hover:text-slate-800 hover:underline"
                >
                  {c.active ? 'Deaktivieren' : 'Aktivieren'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ============ NEUE/EDIT-FIRMA-MODAL ============ */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Firma bearbeiten' : 'Neue Firma'}
        size="md"
      >
        <div className="space-y-3">
          {saveError && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" /> {saveError}
            </div>
          )}
          <Field label="Name">
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              autoFocus
              placeholder="z.B. Müller Bau GmbH"
            />
          </Field>
          <Field label="Typ">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setForm({ ...form, type: 'internal_bauhof' })}
                className={`rounded-lg border px-3 py-2 text-sm ${
                  form.type === 'internal_bauhof'
                    ? 'border-blue-600 bg-blue-50 font-medium text-blue-700'
                    : 'hover:bg-slate-50'
                }`}
              >
                Intern (Bauhof)
              </button>
              <button
                type="button"
                onClick={() => setForm({ ...form, type: 'external_company' })}
                className={`rounded-lg border px-3 py-2 text-sm ${
                  form.type === 'external_company'
                    ? 'border-orange-600 bg-orange-50 font-medium text-orange-700'
                    : 'hover:bg-slate-50'
                }`}
              >
                Externe Firma
              </button>
            </div>
          </Field>
          <Field label="Kontakt-E-Mail (optional)">
            <input
              type="email"
              value={form.contact_email}
              onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Telefon (optional)">
            <input
              type="text"
              value={form.contact_phone}
              onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Adresse (optional)">
            <input
              type="text"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="Straße Hausnr., PLZ Ort"
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setModalOpen(false)}
              className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50"
              disabled={saving}
            >
              Abbrechen
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingId ? 'Speichern' : 'Anlegen'}
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
