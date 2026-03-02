/**
 * Billing Query Hooks
 * React Query hooks for billing operations
 */

import { useMutation } from '@tanstack/react-query';
import { billingService } from '../../services';
import { queryKeys } from '../../lib/react-query';
import {
  UpdateBillingSettingsRequest,
  GetTransactionHistoryRequest,
} from '../../types/api';
import { createQueryHook, createMutationHook } from './createQueryHook';

export const useBalance = createQueryHook(
  () => queryKeys.billing.balance,
  () => billingService.getBalance(),
  { staleTime: 2 * 60 * 1000, refetchInterval: 5 * 60 * 1000 }
);

export const useTransactionHistory = createQueryHook<Awaited<ReturnType<typeof billingService.getTransactionHistory>>, GetTransactionHistoryRequest>(
  (params) => queryKeys.billing.transactions(params),
  (params) => billingService.getTransactionHistory(params),
  { staleTime: 1 * 60 * 1000 }
);

export const useBillingSettings = createQueryHook(
  () => queryKeys.billing.settings,
  async () => ({
    daily_limit_usd: undefined,
    monthly_limit_usd: undefined,
  }),
  { staleTime: 10 * 60 * 1000 }
);

export const useUpdateBillingSettings = createMutationHook<any, UpdateBillingSettingsRequest>(
  (data) => billingService.updateSettings(data),
  [queryKeys.billing.settings]
);

export function useSendTestEmail() {
  return useMutation({
    mutationFn: () => billingService.sendTestEmail(),
  });
}
