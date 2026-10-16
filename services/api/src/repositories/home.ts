import { familyRepository } from './families.js';
import { dashboardRepository } from './dashboard.js';
import { activitiesRepository } from './activities.js';
import { DomainError } from '../db.js';

// Keep authorization and DTOs in the existing repositories. Aggregation removes
// client round trips without adding a permission-bypassing cache or public view.
export const homeRepository = {
  async get(userId: string, preferredFamilyId?: string, fallbackFamilyId?: string) {
    const families = await familyRepository.memberships(userId);
    const current = families.find(m => m.family.id === preferredFamilyId)
      ?? families.find(m => m.family.id === fallbackFamilyId) ?? families[0];
    if (!current) return { families, currentFamilyId: '', dashboard: null, activity: null, joinRequestCount: 0 };
    const id = current.family.id;
    const [dashboard, joinRequestCount] = await Promise.all([
      dashboardRepository.get(id, userId),
      current.member.role === 'admin'
        ? familyRepository.joinRequests(id, userId).then(rows => rows.length).catch(() => null)
        : Promise.resolve(0)
    ]);
    const next = dashboard.upcoming[0] ?? dashboard.activities[0];
    const activity = next ? await activitiesRepository.get(id, next.id, userId).catch(error => {
      // An event can disappear between the dashboard and detail read. Permission
      // errors must still fail the request rather than returning protected data.
      if (error instanceof DomainError && error.status === 404) return null;
      throw error;
    }) : null;
    return { families, currentFamilyId: id, dashboard, activity, joinRequestCount };
  }
};
