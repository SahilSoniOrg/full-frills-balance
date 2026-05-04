import Workplace from '@/src/data/models/Workplace';
import { workplaceRepository } from '@/src/data/repositories/WorkplaceRepository';
import { preferences } from '@/src/utils/preferences';
import { Observable } from 'rxjs';

export class WorkplaceService {
  async createWorkplace(name: string, icon: string): Promise<Workplace> {
    return await workplaceRepository.create({ name, icon });
  }

  async ensureDefaultWorkplace(): Promise<Workplace> {
    // First check if there is an active workplace preference
    const activeWorkplaceId = preferences.activeWorkplaceId;

    // If there is an active workplace preference, try to get the workplace
    if (activeWorkplaceId) {
      const workplace = await this.getWorkplace(activeWorkplaceId);
      if (workplace) return workplace;
    }

    // Try to get an existing workplace
    let workplaces = await this.getAllWorkplaces();

    // If none exist, create a default one
    if (workplaces.length === 0) {
      const defaultWorkplace = await this.createWorkplace('Personal', 'briefcase');
      workplaces = [defaultWorkplace];
      preferences.setActiveWorkplaceId(defaultWorkplace.id);
    }

    return workplaces[0];
  }

  async getWorkplace(id: string): Promise<Workplace | undefined> {
    return await workplaceRepository.find(id);
  }

  async getAllWorkplaces(): Promise<Workplace[]> {
    return await workplaceRepository.findAll();
  }

  async updateWorkplace(id: string, data: Partial<{ name: string; icon: string }>): Promise<void> {
    const workplace = await workplaceRepository.find(id);
    if (!workplace) {
      throw new Error('Workplace not found');
    }
    await workplaceRepository.update(workplace, data);
  }

  observeAllWorkplaces(): Observable<Workplace[]> {
    return workplaceRepository.observeAll();
  }

  observeWorkplace(id: string): Observable<Workplace | undefined> {
    return workplaceRepository.observeById(id);
  }
}

export const workplaceService = new WorkplaceService();
