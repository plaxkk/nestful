import { transaction, iso } from '../db.js';
import { activeMember } from './families.js';

export const dashboardRepository = {
  async get(familyId:string,userId:string){return transaction(async tx=>{
    const actor=await activeMember(tx,familyId,userId);
    const activities=(await tx.query(`select a.id,a.title,a.starts_at from nestful.activities a
      join nestful.activity_participants p on p.activity_id=a.id and p.member_id=$2
      where a.family_id=$1 and a.archived_at is null and a.status in ('draft','scheduled')
      and a.starts_at>=now()-interval '1 day' and p.rsvp in ('pending','tentative')
      order by a.starts_at,a.id limit 10`,[familyId,actor.id])).rows;
    const tasks=(await tx.query(`select t.id,t.title,t.activity_id,a.starts_at from nestful.activity_tasks t
      join nestful.activities a on a.id=t.activity_id where t.family_id=$1 and t.assignee_member_id=$2
      and t.status='open' and a.status in ('draft','scheduled') and a.archived_at is null
      order by a.starts_at,t.id limit 10`,[familyId,actor.id])).rows;
    // Reserve bounded slots for each time group so an old backlog cannot hide
    // today's work or the upcoming reminders shown by the home screen.
    const reminders=(await tx.query(`with visible as (
      select o.id,o.title,o.scheduled_at,
        case when (o.scheduled_at at time zone f.timezone)::date=(now() at time zone f.timezone)::date then 0
          when o.scheduled_at<now() then 1 else 2 end as time_group
      from nestful.reminder_occurrences o
      join nestful.reminder_occurrence_members m on m.occurrence_id=o.id and m.member_id=$2
      join nestful.reminder_plans p on p.id=o.plan_id
      join nestful.families f on f.id=o.family_id
      where o.family_id=$1 and o.canceled_at is null and p.enabled and m.status='pending'
        and o.scheduled_at between now()-interval '7 days' and now()+interval '7 days'
    ), ranked as (
      select id,title,scheduled_at,time_group,
        row_number() over (partition by time_group order by scheduled_at,id) as position
      from visible
    ) select id,title,scheduled_at from ranked where position<=10
      order by time_group,scheduled_at,id`,[familyId,actor.id])).rows;
    const upcoming=(await tx.query(`select id,title,starts_at from nestful.activities where family_id=$1
      and archived_at is null and status in ('draft','scheduled') and starts_at>=now()
      order by starts_at,id limit 5`,[familyId])).rows;
    return {activities:activities.map(r=>({id:r.id as string,title:r.title as string,at:iso(r.starts_at)!})),
      tasks:tasks.map(r=>({id:r.id as string,activityId:r.activity_id as string,title:r.title as string,at:iso(r.starts_at)!})),
      reminders:reminders.map(r=>({id:r.id as string,title:r.title as string,at:iso(r.scheduled_at)!})),
      upcoming:upcoming.map(r=>({id:r.id as string,title:r.title as string,at:iso(r.starts_at)!}))};
  });}
};
