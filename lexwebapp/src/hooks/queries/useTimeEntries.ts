/**
 * Time Entry Query Hooks
 * React Query hooks for time tracking and timers
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  timeEntryService,
} from '../../services/api/TimeEntryService';
import {
  CreateTimeEntryParams,
  UpdateTimeEntryParams,
  TimeEntryFilters,
} from '../../types/models';
import { queryKeys } from '../../lib/react-query';
import { createQueryHook, createMutationHook } from './createQueryHook';

export const useTimeEntries = createQueryHook<Awaited<ReturnType<typeof timeEntryService.getTimeEntries>>, TimeEntryFilters>(
  (filters) => queryKeys.timeEntries.list(filters),
  (filters) => timeEntryService.getTimeEntries(filters),
  { staleTime: 1 * 60 * 1000 }
);

export const useCreateTimeEntry = createMutationHook<any, CreateTimeEntryParams>(
  (data) => timeEntryService.createTimeEntry(data),
  [queryKeys.timeEntries.all]
);

export const useUpdateTimeEntry = createMutationHook<any, { id: string; data: UpdateTimeEntryParams }>(
  ({ id, data }) => timeEntryService.updateTimeEntry(id, data),
  [queryKeys.timeEntries.all]
);

export const useDeleteTimeEntry = createMutationHook<any, string>(
  (id) => timeEntryService.deleteTimeEntry(id),
  [queryKeys.timeEntries.all]
);

export const useSubmitTimeEntry = createMutationHook<any, string>(
  (id) => timeEntryService.submitTimeEntry(id),
  [queryKeys.timeEntries.all]
);

export const useApproveTimeEntry = createMutationHook<any, string>(
  (id) => timeEntryService.approveTimeEntry(id),
  [queryKeys.timeEntries.all]
);

export const useRejectTimeEntry = createMutationHook<any, { id: string; notes?: string }>(
  ({ id, notes }) => timeEntryService.rejectTimeEntry(id, notes),
  [queryKeys.timeEntries.all]
);

// ============================================================================
// Timer Hooks
// ============================================================================

export const useActiveTimers = createQueryHook(
  () => queryKeys.timeEntries.timers,
  () => timeEntryService.getActiveTimers(),
  { staleTime: 30 * 1000, refetchInterval: 30 * 1000 }
);

export const useStartTimer = createMutationHook<any, { matter_id: string; description?: string }>(
  ({ matter_id, description }) => timeEntryService.startTimer(matter_id, description),
  [queryKeys.timeEntries.timers]
);

export function useStopTimer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ matter_id, create_entry }: { matter_id: string; create_entry?: boolean }) =>
      timeEntryService.stopTimer(matter_id, create_entry),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.timeEntries.timers });
      queryClient.invalidateQueries({ queryKey: queryKeys.timeEntries.all });
    },
  });
}

export function usePingTimer() {
  return useMutation({
    mutationFn: (matter_id: string) => timeEntryService.pingTimer(matter_id),
  });
}

// ============================================================================
// Billing Rate Hooks
// ============================================================================

export function useUserRate(userId: string, date?: string) {
  return useQuery({
    queryKey: ['userRate', userId, date],
    queryFn: () => timeEntryService.getUserRate(userId, date),
    enabled: !!userId,
    staleTime: 10 * 60 * 1000,
  });
}

export function useSetUserRate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      user_id,
      hourly_rate_usd,
      effective_from,
      effective_to,
      is_default,
    }: {
      user_id: string;
      hourly_rate_usd: number;
      effective_from?: string;
      effective_to?: string;
      is_default?: boolean;
    }) =>
      timeEntryService.setUserRate(
        user_id,
        hourly_rate_usd,
        effective_from,
        effective_to,
        is_default
      ),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['userRate', variables.user_id] });
    },
  });
}
