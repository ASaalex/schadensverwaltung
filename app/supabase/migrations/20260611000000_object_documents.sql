-- =============================================================================
--  Dokumente zu Netz-Objekten
-- =============================================================================

CREATE TABLE network_object_documents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  object_id    uuid NOT NULL REFERENCES network_objects(id) ON DELETE CASCADE,
  file_name    text NOT NULL,
  storage_path text NOT NULL,
  mime_type    text,
  size_bytes   bigint,
  uploaded_by  uuid REFERENCES users(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX network_object_documents_object_idx ON network_object_documents(object_id);

ALTER TABLE network_object_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nod_read" ON network_object_documents
  FOR SELECT USING (company_id = current_user_company_id());
CREATE POLICY "nod_insert" ON network_object_documents
  FOR INSERT WITH CHECK (company_id = current_user_company_id());
CREATE POLICY "nod_delete" ON network_object_documents
  FOR DELETE USING (company_id = current_user_company_id());

-- ── Storage-Bucket ───────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('object-documents', 'object-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Pfad-Konvention: <company_id>/<object_id>/<uuid>_<dateiname>
-- → erster Ordner = company_id; nur eigene Firma darf zugreifen
CREATE POLICY "object_docs_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'object-documents'
         AND (storage.foldername(name))[1] = current_user_company_id()::text);

CREATE POLICY "object_docs_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'object-documents'
              AND (storage.foldername(name))[1] = current_user_company_id()::text);

CREATE POLICY "object_docs_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'object-documents'
         AND (storage.foldername(name))[1] = current_user_company_id()::text);
