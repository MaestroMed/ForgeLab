import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface SocialStatus {
  available: boolean;
  connected_accounts: Array<string | { platform: string; username?: string }>;
  supported_platforms: string[];
}

/**
 * Shared social-accounts status hook.
 *
 * Connection state changes only on explicit OAuth flows, so a minute of
 * caching is plenty. Any modal that wants to know which platforms are
 * linked subscribes to the same query — one request feeds every caller.
 */
export function useSocialStatus() {
  return useQuery<SocialStatus>({
    queryKey: ['social-status'],
    queryFn: async () => {
      const res = (await api.getSocialStatus()) as unknown as SocialStatus & {
        data?: SocialStatus;
      };
      // Some endpoints wrap the payload in `{ data: ... }`; unwrap transparently.
      return (res?.data ?? res) as SocialStatus;
    },
    staleTime: 60_000,
    gcTime: 5 * 60 * 1000,
  });
}
