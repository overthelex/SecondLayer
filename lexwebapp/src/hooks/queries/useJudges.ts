import { useQuery } from '@tanstack/react-query';
import { judgesService, JudgesSearchParams } from '../../services/api/JudgesService';
import { queryKeys } from '../../lib/react-query';

export function useJudges(params?: JudgesSearchParams) {
  return useQuery({
    queryKey: queryKeys.judges.list(params),
    queryFn: () => judgesService.getJudges(params),
    staleTime: 5 * 60 * 1000,
  });
}
