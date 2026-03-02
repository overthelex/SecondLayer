/**
 * Matter Query Hooks
 * React Query hooks for matter, team, hold, and audit management
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  matterService,
  SearchMattersParams,
  AuditLogParams,
} from '../../services/api/MatterService';
import {
  CreateMatterRequest,
  UpdateMatterRequest,
  CreateHoldRequest,
  MatterTeamRole,
  MatterAccessLevel,
} from '../../types/models/Matter';
import { queryKeys } from '../../lib/react-query';
import { createQueryHook, createDetailQueryHook, createMutationHook } from './createQueryHook';

// ─── Matters ─────────────────────────────────────────────

export const useMatters = createQueryHook<Awaited<ReturnType<typeof matterService.getMatters>>, SearchMattersParams>(
  (params) => queryKeys.matters.list(params),
  (params) => matterService.getMatters(params),
  { staleTime: 2 * 60 * 1000 }
);

export const useMatter = createDetailQueryHook(
  (id) => queryKeys.matters.detail(id),
  (id) => matterService.getMatterById(id),
  { staleTime: 5 * 60 * 1000 }
);

export const useCreateMatter = createMutationHook<any, CreateMatterRequest>(
  (data) => matterService.createMatter(data),
  [queryKeys.matters.all, queryKeys.clients.all]
);

export function useUpdateMatter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateMatterRequest }) =>
      matterService.updateMatter(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.matters.detail(variables.id),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.matters.all });
    },
  });
}

export function useCloseMatter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (matterId: string) => matterService.closeMatter(matterId),
    onSuccess: (_, matterId) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.matters.detail(matterId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.matters.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.all });
    },
  });
}

// ─── Team ────────────────────────────────────────────────

export const useMatterTeam = createDetailQueryHook(
  (matterId) => queryKeys.matters.team(matterId),
  (matterId) => matterService.getTeamMembers(matterId),
  { staleTime: 2 * 60 * 1000 }
);

export function useAddTeamMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      matterId,
      memberId,
      role,
      accessLevel,
    }: {
      matterId: string;
      memberId: string;
      role?: MatterTeamRole;
      accessLevel?: MatterAccessLevel;
    }) => matterService.addTeamMember(matterId, memberId, role, accessLevel),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.matters.team(variables.matterId),
      });
    },
  });
}

export function useRemoveTeamMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ matterId, userId }: { matterId: string; userId: string }) =>
      matterService.removeTeamMember(matterId, userId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.matters.team(variables.matterId),
      });
    },
  });
}

// ─── Matter Documents ────────────────────────────────────

export const useMatterDocuments = createDetailQueryHook(
  (matterId) => queryKeys.matters.documents(matterId),
  (matterId) => matterService.getMatterDocuments(matterId),
  { staleTime: 2 * 60 * 1000 }
);

export function useAssignDocuments() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ matterId, documentIds }: { matterId: string; documentIds: string[] }) =>
      matterService.assignDocumentsToMatter(matterId, documentIds),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.matters.documents(variables.matterId),
      });
    },
  });
}

export function useUnassignDocuments() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ matterId, documentIds }: { matterId: string; documentIds: string[] }) =>
      matterService.unassignDocumentsFromMatter(matterId, documentIds),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.matters.documents(variables.matterId),
      });
    },
  });
}

// ─── Legal Holds ─────────────────────────────────────────

export const useMatterHolds = createDetailQueryHook(
  (matterId) => queryKeys.matters.holds(matterId),
  (matterId) => matterService.getHolds(matterId),
  { staleTime: 2 * 60 * 1000 }
);

export function useCreateHold() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ matterId, data }: { matterId: string; data: CreateHoldRequest }) =>
      matterService.createHold(matterId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.matters.holds(variables.matterId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.matters.detail(variables.matterId),
      });
    },
  });
}

export function useReleaseHold() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ holdId }: { holdId: string; matterId: string }) =>
      matterService.releaseHold(holdId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.matters.holds(variables.matterId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.matters.detail(variables.matterId),
      });
    },
  });
}

// ─── Audit ───────────────────────────────────────────────

export const useAuditLog = createQueryHook<Awaited<ReturnType<typeof matterService.getAuditLog>>, AuditLogParams>(
  (params) => queryKeys.audit.list(params),
  (params) => matterService.getAuditLog(params),
  { staleTime: 30 * 1000 }
);

export function useValidateAuditChain() {
  return useMutation({
    mutationFn: () => matterService.validateAuditChain(),
  });
}
