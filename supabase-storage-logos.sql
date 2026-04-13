-- ============================================================
-- Storage policies para federation-logos
-- SELECT: publico (leitura)
-- INSERT/UPDATE/DELETE: super_admin ou admin/organizer da federacao dona da pasta
-- ============================================================

DROP POLICY IF EXISTS "logos_public_read" ON storage.objects;
CREATE POLICY "logos_public_read" ON storage.objects FOR SELECT
  USING (bucket_id = 'federation-logos');

DROP POLICY IF EXISTS "logos_insert_fed_admin" ON storage.objects;
CREATE POLICY "logos_insert_fed_admin" ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'federation-logos'
    AND (
      auth.role() = 'service_role'
      OR EXISTS (
        SELECT 1 FROM organizers o
        LEFT JOIN federations f ON f.id = o.federation_id
        WHERE o.email = lower(coalesce(auth.email(),''))
          AND o.active
          AND o.role IN ('super_admin','admin')
          AND (o.role = 'super_admin' OR (storage.foldername(storage.objects.name))[1] = f.slug)
      )
    )
  );

DROP POLICY IF EXISTS "logos_update_fed_admin" ON storage.objects;
CREATE POLICY "logos_update_fed_admin" ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'federation-logos'
    AND (
      auth.role() = 'service_role'
      OR EXISTS (
        SELECT 1 FROM organizers o
        LEFT JOIN federations f ON f.id = o.federation_id
        WHERE o.email = lower(coalesce(auth.email(),''))
          AND o.active
          AND o.role IN ('super_admin','admin')
          AND (o.role = 'super_admin' OR (storage.foldername(storage.objects.name))[1] = f.slug)
      )
    )
  );

DROP POLICY IF EXISTS "logos_delete_fed_admin" ON storage.objects;
CREATE POLICY "logos_delete_fed_admin" ON storage.objects FOR DELETE
  USING (
    bucket_id = 'federation-logos'
    AND (
      auth.role() = 'service_role'
      OR EXISTS (
        SELECT 1 FROM organizers o
        LEFT JOIN federations f ON f.id = o.federation_id
        WHERE o.email = lower(coalesce(auth.email(),''))
          AND o.active
          AND o.role IN ('super_admin','admin')
          AND (o.role = 'super_admin' OR (storage.foldername(storage.objects.name))[1] = f.slug)
      )
    )
  );
