import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface Dictionary {
  id: string;
  name: string;
  description: string;
  author: string;
  corrections_count: number;
  hotwords_count: number;
}

/**
 * Shared dictionaries hook.
 *
 * Dictionaries rarely change, so we cache aggressively. Every component that
 * renders a dictionary picker subscribes to the same query — the list is
 * fetched once per ~5 minute window, regardless of how many pickers mount.
 */
export function useDictionaries() {
  return useQuery<Dictionary[]>({
    queryKey: ['dictionaries'],
    queryFn: async () => {
      const res = await api.listDictionaries();
      return (res?.data ?? []) as Dictionary[];
    },
    staleTime: 5 * 60 * 1000, // 5 min — dictionaries rarely change
    gcTime: 10 * 60 * 1000,
  });
}
