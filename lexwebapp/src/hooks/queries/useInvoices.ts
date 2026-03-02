/**
 * Invoice Query Hooks
 * React Query hooks for invoice management
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  invoiceService,
  InvoiceFilters,
  RecordPaymentParams,
  AddLineItemParams,
} from '../../services/api/InvoiceService';
import { GenerateInvoiceParams } from '../../types/models';
import { queryKeys } from '../../lib/react-query';
import { createQueryHook, createDetailQueryHook } from './createQueryHook';

export const useInvoices = createQueryHook<Awaited<ReturnType<typeof invoiceService.getInvoices>>, InvoiceFilters>(
  (filters) => queryKeys.invoices.list(filters),
  (filters) => invoiceService.getInvoices(filters),
  { staleTime: 2 * 60 * 1000 }
);

export const useInvoice = createDetailQueryHook(
  (id) => queryKeys.invoices.detail(id),
  (id) => invoiceService.getInvoiceById(id),
  { staleTime: 1 * 60 * 1000 }
);

export function useGenerateInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: GenerateInvoiceParams) => invoiceService.generateInvoice(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.timeEntries.all });
    },
  });
}

export function useDownloadInvoicePDF() {
  return useMutation({
    mutationFn: ({ id, invoiceNumber }: { id: string; invoiceNumber: string }) =>
      invoiceService.downloadInvoiceFile(id, invoiceNumber),
  });
}

export function useSendInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => invoiceService.sendInvoice(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all });
    },
  });
}

export function useRecordPayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, params }: { id: string; params: RecordPaymentParams }) =>
      invoiceService.recordPayment(id, params),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all });
    },
  });
}

export function useVoidInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => invoiceService.voidInvoice(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.timeEntries.all });
    },
  });
}

export function useAddLineItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, params }: { id: string; params: AddLineItemParams }) =>
      invoiceService.addLineItem(id, params),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all });
    },
  });
}
