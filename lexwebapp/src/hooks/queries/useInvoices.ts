/**
 * Invoice Query Hooks
 * React Query hooks for invoice management
 */

import {
  invoiceService,
  InvoiceFilters,
  RecordPaymentParams,
  AddLineItemParams,
} from '../../services/api/InvoiceService';
import { GenerateInvoiceParams } from '../../types/models';
import { queryKeys } from '../../lib/react-query';
import { createQueryHook, createDetailQueryHook, createMutationHook } from './createQueryHook';

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

export const useGenerateInvoice = createMutationHook<any, GenerateInvoiceParams>(
  (params) => invoiceService.generateInvoice(params),
  [queryKeys.invoices.all, queryKeys.timeEntries.all]
);

export const useDownloadInvoicePDF = createMutationHook<any, { id: string; invoiceNumber: string }>(
  ({ id, invoiceNumber }) => invoiceService.downloadInvoiceFile(id, invoiceNumber),
  []
);

export const useSendInvoice = createMutationHook<any, string>(
  (id) => invoiceService.sendInvoice(id),
  {
    onSuccess: (qc, _, id) => {
      qc.invalidateQueries({ queryKey: queryKeys.invoices.detail(id) });
      qc.invalidateQueries({ queryKey: queryKeys.invoices.all });
    },
  }
);

export const useRecordPayment = createMutationHook<any, { id: string; params: RecordPaymentParams }>(
  ({ id, params }) => invoiceService.recordPayment(id, params),
  {
    onSuccess: (qc, _, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.invoices.detail(variables.id) });
      qc.invalidateQueries({ queryKey: queryKeys.invoices.all });
    },
  }
);

export const useVoidInvoice = createMutationHook<any, string>(
  (id) => invoiceService.voidInvoice(id),
  {
    onSuccess: (qc, _, id) => {
      qc.invalidateQueries({ queryKey: queryKeys.invoices.detail(id) });
      qc.invalidateQueries({ queryKey: queryKeys.invoices.all });
      qc.invalidateQueries({ queryKey: queryKeys.timeEntries.all });
    },
  }
);

export const useAddLineItem = createMutationHook<any, { id: string; params: AddLineItemParams }>(
  ({ id, params }) => invoiceService.addLineItem(id, params),
  {
    onSuccess: (qc, _, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.invoices.detail(variables.id) });
      qc.invalidateQueries({ queryKey: queryKeys.invoices.all });
    },
  }
);
