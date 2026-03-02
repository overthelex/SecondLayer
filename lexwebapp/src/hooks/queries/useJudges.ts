import { judgesService, JudgesSearchParams } from '../../services/api/JudgesService';
import { queryKeys } from '../../lib/react-query';
import { createQueryHook } from './createQueryHook';

export const useJudges = createQueryHook<Awaited<ReturnType<typeof judgesService.getJudges>>, JudgesSearchParams>(
  (params) => queryKeys.judges.list(params),
  (params) => judgesService.getJudges(params),
  { staleTime: 5 * 60 * 1000 }
);
