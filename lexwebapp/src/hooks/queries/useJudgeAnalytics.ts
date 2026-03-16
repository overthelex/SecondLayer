import { judgeAnalyticsService, JudgeAnalyticsFilters } from '../../services/api/JudgeAnalyticsService';
import { queryKeys } from '../../lib/react-query';
import { createQueryHook, createDetailQueryHook } from './createQueryHook';

export const useJudgeAnalytics = createQueryHook<
  Awaited<ReturnType<typeof judgeAnalyticsService.getAnalyticsList>>,
  JudgeAnalyticsFilters
>(
  (params) => queryKeys.judgeAnalytics.list(params),
  (params) => judgeAnalyticsService.getAnalyticsList(params),
  { staleTime: 10 * 60 * 1000 }
);

export const useJudgeAnalyticsDetail = createDetailQueryHook<
  Awaited<ReturnType<typeof judgeAnalyticsService.getAnalyticsDetail>>
>(
  (id) => queryKeys.judgeAnalytics.detail(id),
  (id) => judgeAnalyticsService.getAnalyticsDetail(id),
  { staleTime: 10 * 60 * 1000 }
);
