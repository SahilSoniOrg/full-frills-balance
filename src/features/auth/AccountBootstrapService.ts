import { supabase } from '@/src/services/supabase';
import { database } from '@/src/data/database/Database';
import Workplace from '@/src/data/models/Workplace';
import { logger } from '@/src/utils/logger';
import { User } from '@supabase/supabase-js';

export class AccountBootstrapService {
  /**
   * Main entry point to bootstrap a user's local data to Supabase.
   */
  async bootstrapUser(user: User) {
    try {
      logger.info('Starting account bootstrap for user', { userId: user.id });

      const profileCreated = await this.createProfile(user);
      if (!profileCreated) {
        // If profile already exists and we didn't just create it,
        // we might not want to re-bootstrap everything unless needed.
        // For idempotency, we will just continue and skip existing ones.
      }

      await this.createRemoteWorkplaces(user);

      logger.info('Account bootstrap completed successfully');
    } catch (error) {
      logger.error('Failed to bootstrap account', { error });
      // We don't throw here to avoid breaking the app. We can retry later.
    }
  }

  private async createProfile(user: User): Promise<boolean> {
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .single();

    if (existingProfile) {
      return false; // Already exists
    }

    const { error: insertError } = await supabase.from('profiles').insert({
      id: user.id,
      display_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
      email: user.email,
    });

    if (insertError) {
      logger.error('Error creating profile', { insertError });
      throw insertError;
    }

    return true;
  }

  private async createRemoteWorkplaces(user: User) {
    // 1. Fetch local workplaces that don't have a remote_workplace_id yet
    const localWorkplaces = await database.get<Workplace>('workplaces').query().fetch();
    const unlinkedWorkplaces = localWorkplaces.filter(wp => !wp.remoteWorkplaceId);

    if (unlinkedWorkplaces.length === 0) {
      return;
    }

    for (const wp of unlinkedWorkplaces) {
      try {
        // 2. Create in Supabase
        const { data: remoteWp, error: wpError } = await supabase
          .from('workplaces')
          .insert({
            name: wp.name,
            // we omit id to let gen_random_uuid() generate it
          })
          .select('id')
          .single();

        if (wpError || !remoteWp) {
          logger.error('Error creating remote workplace', { wpError, localId: wp.id });
          continue; // skip this one and try the next
        }

        const remoteId = remoteWp.id;

        // 3. Create owner membership
        const { error: memberError } = await supabase.from('workplace_members').insert({
          workplace_id: remoteId,
          user_id: user.id,
          role: 'owner',
        });

        if (memberError) {
          logger.error('Error creating owner membership', { memberError, remoteId });
          continue;
        }

        // 4. Persist mapping locally
        await this.persistMapping(wp, remoteId);
      } catch (error) {
        logger.error('Unexpected error during workplace bootstrap loop', { error, localId: wp.id });
      }
    }
  }

  private async persistMapping(workplace: Workplace, remoteId: string) {
    await database.write(async () => {
      await workplace.update(wp => {
        wp.remoteWorkplaceId = remoteId;
      });
    });
  }
}

export const accountBootstrapService = new AccountBootstrapService();
