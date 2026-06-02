import { supabase } from '@/src/services/supabase';
import { logger } from '@/src/utils/logger';

export interface Membership {
  workplace_id: string;
  user_id: string;
  role: 'owner' | 'editor' | 'viewer';
  created_at: string;
}

export class MembershipRepository {
  async getMemberships(): Promise<Membership[]> {
    try {
      const { data, error } = await supabase.from('workplace_members').select('*');

      if (error) throw error;
      return data || [];
    } catch (error) {
      logger.error('Failed to get memberships', { error });
      return [];
    }
  }

  async getOwnedWorkplaces(): Promise<string[]> {
    try {
      const { data, error } = await supabase
        .from('workplace_members')
        .select('workplace_id')
        .eq('role', 'owner');

      if (error) throw error;
      return data?.map(row => row.workplace_id) || [];
    } catch (error) {
      logger.error('Failed to get owned workplaces', { error });
      return [];
    }
  }

  async getRoleForWorkplace(workplaceId: string): Promise<string | null> {
    try {
      const { data, error } = await supabase
        .from('workplace_members')
        .select('role')
        .eq('workplace_id', workplaceId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // not found
          return null;
        }
        throw error;
      }
      return data?.role || null;
    } catch (error) {
      logger.error('Failed to get role for workplace', { error, workplaceId });
      return null;
    }
  }
}

export const membershipRepository = new MembershipRepository();
