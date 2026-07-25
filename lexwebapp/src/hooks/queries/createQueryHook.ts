/**
 * Query Hook Factories
 * Reduces boilerplate for creating React Query hooks
 */

import { QueryKey, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

/**
 * Creates a simple list query hook
 */
export function createQueryHook<TData, TParams = void>(
  queryKeyFn: (params?: TParams) => QueryKey,
  fetchFn: (params?: TParams) => Promise<TData>,
  options?: { staleTime?: number; refetchInterval?: number }
) {
  return (params?: TParams) =>
    useQuery({
      queryKey: queryKeyFn(params),
      queryFn: () => fetchFn(params),
      staleTime: options?.staleTime ?? 5 * 60 * 1000,
      ...(options?.refetchInterval && { refetchInterval: options.refetchInterval }),
    });
}

/**
 * Creates a detail query hook with `enabled` guard
 */
export function createDetailQueryHook<TData>(
  queryKeyFn: (id: string) => QueryKey,
  fetchFn: (id: string) => Promise<TData>,
  options?: { staleTime?: number }
) {
  return (id: string) =>
    useQuery({
      queryKey: queryKeyFn(id),
      queryFn: () => fetchFn(id),
      enabled: !!id,
      staleTime: options?.staleTime ?? 5 * 60 * 1000,
    });
}

/**
 * Creates a mutation hook that invalidates query keys on success.
 *
 * Supports two signatures:
 *   1. Static keys:   createMutationHook(fn, [key1, key2])
 *   2. Dynamic keys:  createMutationHook(fn, { onSuccess: (qc, data, vars) => ... })
 */
export function createMutationHook<TData, TVariables>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  invalidation:
    | QueryKey[]
    | {
        onSuccess: (
          queryClient: ReturnType<typeof useQueryClient>,
          data: TData,
          variables: TVariables
        ) => void;
      }
) {
  return () => {
    const queryClient = useQueryClient();

    return useMutation({
      mutationFn,
      onSuccess: (data, variables) => {
        if (Array.isArray(invalidation)) {
          invalidation.forEach((key) => {
            queryClient.invalidateQueries({ queryKey: key });
          });
        } else {
          invalidation.onSuccess(queryClient, data, variables);
        }
      },
    });
  };
}
