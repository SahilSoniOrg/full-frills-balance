import { storage } from '@/src/utils/storage';

const LEGACY_TYPESAFE_API_KEY_STORAGE_KEY = 'full_frills_balance_typesafe_api_key';

/** Remove the API key written by the retired client-side TypeSafe integration. */
export function removeLegacyTypeSafeApiKey(): void {
  storage.remove(LEGACY_TYPESAFE_API_KEY_STORAGE_KEY);
}
