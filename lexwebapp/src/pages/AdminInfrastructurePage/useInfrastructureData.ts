/**
 * Custom hook for fetching all infrastructure dashboard data
 */

import { useEffect, useState, useCallback } from 'react';
import { api } from '../../utils/api-client';
import { getErrorMessage } from '../../utils/errors';
import type { TimeRange, SectionState } from './types';

const INITIAL_STATE: SectionState<any> = { data: null, loading: true, error: null };

export function useInfrastructureData(range: TimeRange) {
  const [refreshKey, setRefreshKey] = useState(0);

  const [backendDetail, setBackendDetail] = useState<SectionState<any>>(INITIAL_STATE);
  const [uploadPipeline, setUploadPipeline] = useState<SectionState<any>>(INITIAL_STATE);
  const [costRealtime, setCostRealtime] = useState<SectionState<any>>(INITIAL_STATE);
  const [infrastructure, setInfrastructure] = useState<SectionState<any>>(INITIAL_STATE);

  const fetchBackendDetail = useCallback(async () => {
    setBackendDetail((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const { data } = await api.admin.getBackendDetailMetrics(range);
      setBackendDetail({ data, loading: false, error: null });
    } catch (e: unknown) {
      setBackendDetail({ data: null, loading: false, error: getErrorMessage(e) });
    }
  }, [range]);

  const fetchUploadPipeline = useCallback(async () => {
    setUploadPipeline((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const { data } = await api.admin.getUploadPipelineMetrics(range);
      setUploadPipeline({ data, loading: false, error: null });
    } catch (e: unknown) {
      setUploadPipeline({ data: null, loading: false, error: getErrorMessage(e) });
    }
  }, [range]);

  const fetchCostRealtime = useCallback(async () => {
    setCostRealtime((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const { data } = await api.admin.getCostRealtimeMetrics(range);
      setCostRealtime({ data, loading: false, error: null });
    } catch (e: unknown) {
      setCostRealtime({ data: null, loading: false, error: getErrorMessage(e) });
    }
  }, [range]);

  const fetchInfrastructure = useCallback(async () => {
    setInfrastructure((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const { data } = await api.admin.getInfrastructureMetrics(range);
      setInfrastructure({ data, loading: false, error: null });
    } catch (e: unknown) {
      setInfrastructure({ data: null, loading: false, error: getErrorMessage(e) });
    }
  }, [range]);

  useEffect(() => {
    fetchBackendDetail();
    fetchUploadPipeline();
    fetchCostRealtime();
    fetchInfrastructure();
  }, [fetchBackendDetail, fetchUploadPipeline, fetchCostRealtime, fetchInfrastructure, refreshKey]);

  const handleRefresh = () => setRefreshKey((k) => k + 1);

  return {
    backendDetail,
    uploadPipeline,
    costRealtime,
    infrastructure,
    handleRefresh,
  };
}
