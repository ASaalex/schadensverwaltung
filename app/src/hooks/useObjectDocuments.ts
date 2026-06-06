import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/auth/AuthContext';

export interface ObjectDocument {
  id: string;
  object_id: string;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_by: string | null;
  created_at: string;
}

const BUCKET = 'object-documents';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = () => (supabase as any).from('network_object_documents');

export function useObjectDocuments(objectId: string | undefined) {
  const { profile } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['object-documents', objectId],
    queryFn: async (): Promise<ObjectDocument[]> => {
      const { data, error } = await tbl()
        .select('*')
        .eq('object_id', objectId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ObjectDocument[];
    },
    enabled: !!objectId,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['object-documents', objectId] });

  const uploadMut = useMutation({
    mutationFn: async (file: File) => {
      if (!profile?.company_id || !objectId) throw new Error('Kein Profil/Objekt');
      const uuid = crypto.randomUUID();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `${profile.company_id}/${objectId}/${uuid}_${safeName}`;

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, file, { contentType: file.type || 'application/octet-stream', upsert: false });
      if (upErr) throw new Error(`Upload fehlgeschlagen: ${upErr.message}`);

      const { error: insErr } = await tbl().insert({
        company_id:   profile.company_id,
        object_id:    objectId,
        file_name:    file.name,
        storage_path: storagePath,
        mime_type:    file.type || null,
        size_bytes:   file.size,
        uploaded_by:  profile.id,
      });
      if (insErr) {
        // Rollback Storage
        await supabase.storage.from(BUCKET).remove([storagePath]);
        throw new Error(`Speichern fehlgeschlagen: ${insErr.message}`);
      }
    },
    onSuccess: invalidate,
  });

  const deleteMut = useMutation({
    mutationFn: async (doc: ObjectDocument) => {
      await supabase.storage.from(BUCKET).remove([doc.storage_path]);
      const { error } = await tbl().delete().eq('id', doc.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  /** Erzeugt eine temporäre Download-URL */
  async function getUrl(storagePath: string): Promise<string | null> {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, 60 * 10); // 10 Minuten
    if (error) return null;
    return data.signedUrl;
  }

  return { query, uploadMut, deleteMut, getUrl };
}
