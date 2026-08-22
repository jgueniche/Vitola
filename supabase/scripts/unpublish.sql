-- Retour arrière de la publication d'amorçage du 22 août 2026.
--
-- Une commande, parce qu'un garde-fou qu'on ne sait pas défaire n'est pas un
-- garde-fou. Remet TOUTES les fiches en brouillon : le référentiel redevient
-- invisible d'un visiteur anonyme, la RLS s'en charge.
--
--   curl -X POST "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/database/query" \
--        -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
--        -H 'Content-Type: application/json' \
--        --data "$(python3 -c 'import json,sys;print(json.dumps({"query":sys.stdin.read()}))' \
--                  < supabase/scripts/unpublish.sql)"
--
-- Ne touche pas aux données elles-mêmes : seulement au statut et à verified_at.

begin;

update ref.cigars
   set status = 'draft',
       verified_at = null
 where status = 'published';

insert into public.audit_log (actor_id, action, entity_schema, entity_table, entity_id, after_state)
values (null, 'cigar.unpublish.batch', 'ref', 'cigars', 'seed-2026-08-22',
        jsonb_build_object('drafted', (select count(*) from ref.cigars where status='draft')));

commit;

select status::text as statut, count(*) from ref.cigars group by 1;
