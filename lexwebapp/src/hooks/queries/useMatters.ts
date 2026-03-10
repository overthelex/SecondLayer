/**
 * Matter Query Hooks
 * React Query hooks for matter, team, hold, and audit management
 */

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

export const useUpdateMatter = createMutationHook<any, { id: string; data: UpdateMatterRequest }>(
  ({ id, data }) => matterService.updateMatter(id, data),
  {
    onSuccess: (qc, _, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.matters.detail(variables.id) });
      qc.invalidateQueries({ queryKey: queryKeys.matters.all });
    },
  }
);

export const useCloseMatter = createMutationHook<any, string>(
  (matterId) => matterService.closeMatter(matterId),
  {
    onSuccess: (qc, _, matterId) => {
      qc.invalidateQueries({ queryKey: queryKeys.matters.detail(matterId) });
      qc.invalidateQueries({ queryKey: queryKeys.matters.all });
      qc.invalidateQueries({ queryKey: queryKeys.clients.all });
    },
  }
);

// ─── Team ────────────────────────────────────────────────

export const useMatterTeam = createDetailQueryHook(
  (matterId) => queryKeys.matters.team(matterId),
  (matterId) => matterService.getTeamMembers(matterId),
  { staleTime: 2 * 60 * 1000 }
);

export const useAddTeamMember = createMutationHook<
  any,
  { matterId: string; memberId: string; role?: MatterTeamRole; accessLevel?: MatterAccessLevel }
>(
  ({ matterId, memberId, role, accessLevel }) =>
    matterService.addTeamMember(matterId, memberId, role, accessLevel),
  {
    onSuccess: (qc, _, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.matters.team(variables.matterId) });
    },
  }
);

export const useRemoveTeamMember = createMutationHook<any, { matterId: string; userId: string }>(
  ({ matterId, userId }) => matterService.removeTeamMember(matterId, userId),
  {
    onSuccess: (qc, _, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.matters.team(variables.matterId) });
    },
  }
);

// ─── Matter Documents ────────────────────────────────────

export const useMatterDocuments = createDetailQueryHook(
  (matterId) => queryKeys.matters.documents(matterId),
  (matterId) => matterService.getMatterDocuments(matterId),
  { staleTime: 2 * 60 * 1000 }
);

export const useAssignDocuments = createMutationHook<any, { matterId: string; documentIds: string[] }>(
  ({ matterId, documentIds }) => matterService.assignDocumentsToMatter(matterId, documentIds),
  {
    onSuccess: (qc, _, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.matters.documents(variables.matterId) });
    },
  }
);

export const useUnassignDocuments = createMutationHook<any, { matterId: string; documentIds: string[] }>(
  ({ matterId, documentIds }) => matterService.unassignDocumentsFromMatter(matterId, documentIds),
  {
    onSuccess: (qc, _, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.matters.documents(variables.matterId) });
    },
  }
);

// ─── Legal Holds ─────────────────────────────────────────

export const useMatterHolds = createDetailQueryHook(
  (matterId) => queryKeys.matters.holds(matterId),
  (matterId) => matterService.getHolds(matterId),
  { staleTime: 2 * 60 * 1000 }
);

export const useCreateHold = createMutationHook<any, { matterId: string; data: CreateHoldRequest }>(
  ({ matterId, data }) => matterService.createHold(matterId, data),
  {
    onSuccess: (qc, _, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.matters.holds(variables.matterId) });
      qc.invalidateQueries({ queryKey: queryKeys.matters.detail(variables.matterId) });
    },
  }
);

export const useReleaseHold = createMutationHook<any, { holdId: string; matterId: string }>(
  ({ holdId }) => matterService.releaseHold(holdId),
  {
    onSuccess: (qc, _, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.matters.holds(variables.matterId) });
      qc.invalidateQueries({ queryKey: queryKeys.matters.detail(variables.matterId) });
    },
  }
);

// ─── Audit ───────────────────────────────────────────────

export const useAuditLog = createQueryHook<Awaited<ReturnType<typeof matterService.getAuditLog>>, AuditLogParams>(
  (params) => queryKeys.audit.list(params),
  (params) => matterService.getAuditLog(params),
  { staleTime: 30 * 1000 }
);

export const useValidateAuditChain = createMutationHook<any, void>(
  () => matterService.validateAuditChain(),
  []
);
