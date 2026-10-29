-- Read-only metadata. Run on the intended database before approving/applying write migrations.
BEGIN READ ONLY;
SELECT table_name,column_name,data_type,is_nullable,column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name IN ('profiles','channels','channel_members','messages','notifications','clients','mcp_audit_logs')
ORDER BY table_name,ordinal_position;
SELECT conrelid::regclass AS table_name,conname,pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE connamespace='public'::regnamespace AND conrelid IN ('public.profiles'::regclass,'public.messages'::regclass,'public.channels'::regclass,'public.clients'::regclass)
ORDER BY conrelid::regclass::text,conname;
COMMIT;
