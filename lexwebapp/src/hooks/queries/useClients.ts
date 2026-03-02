/**
 * Client Query Hooks
 * React Query hooks for client management
 */

import {
  clientService,
  SearchClientsParams,
} from '../../services/api/ClientService';
import { CreateClientRequest, UpdateClientRequest } from '../../types/models/Client';
import { queryKeys } from '../../lib/react-query';
import { createQueryHook, createDetailQueryHook, createMutationHook } from './createQueryHook';

export const useClients = createQueryHook<Awaited<ReturnType<typeof clientService.getClients>>, SearchClientsParams>(
  (params) => queryKeys.clients.list(params),
  (params) => clientService.getClients(params),
  { staleTime: 2 * 60 * 1000 }
);

export const useClient = createDetailQueryHook(
  (id) => queryKeys.clients.detail(id),
  (id) => clientService.getClientById(id),
  { staleTime: 5 * 60 * 1000 }
);

export const useCreateClient = createMutationHook<any, CreateClientRequest>(
  (data) => clientService.createClient(data),
  [queryKeys.clients.all]
);

export const useUpdateClient = createMutationHook<any, { id: string; data: UpdateClientRequest }>(
  ({ id, data }) => clientService.updateClient(id, data),
  [queryKeys.clients.all]
);

export const useConflictCheck = createMutationHook<any, string>(
  (clientId) => clientService.runConflictCheck(clientId),
  [queryKeys.clients.all]
);
