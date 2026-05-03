import { workplaceRepository } from '@/src/data/repositories/WorkplaceRepository';
import Workplace from '@/src/data/models/Workplace';
import { Observable } from 'rxjs';

export class WorkplaceService {
  async createWorkplace(name: string, icon: string): Promise<Workplace> {
    return await workplaceRepository.create({ name, icon });
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
