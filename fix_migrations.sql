INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
SELECT gen_random_uuid(), 'manual', now(), m.name, NULL, NULL, now(), 1
FROM (VALUES 
  ('20260214190249_add_site_entity_and_config'),
  ('20260216202736_add_team_permissions'),
  ('20260217075843_user_teams_many_to_many'),
  ('20260225175124_init_versioning_and_budget'),
  ('20260225182806_add_wbs_description_and_task_phases'),
  ('20260225184729_add_ai_fields_to_subtask'),
  ('20260225195057_budget_nodeid'),
  ('20260308054729_add_site_contact_fields'),
  ('20260310213807_add_flexible_node_fields'),
  ('20260310222355_add_file_storage_fields'),
  ('20260310230325_add_version_notes'),
  ('20260310230941_add_budget_notes_to_requirements'),
  ('20260310232142_add_discount_to_budget_item'),
  ('20260310235754_add_offer_status')
) AS m(name)
WHERE NOT EXISTS (
  SELECT 1 FROM _prisma_migrations WHERE migration_name = m.name
);
