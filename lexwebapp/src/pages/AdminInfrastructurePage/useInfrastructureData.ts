/**
 * Custom hook for fetching all infrastructure dashboard data
 */

import { useEffect, useState, useCallback } from 'react';
import { api } from '../../utils/api-client';
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
    } catch (e: any) {
      setBackendDetail({ data: null, loading: false, error: e.message || 'Failed to load' });
    }
  }, [range]);

  const fetchUploadPipeline = useCallback(async () => {
    setUploadPipeline((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const { data } = await api.admin.getUploadPipelineMetrics(range);
      setUploadPipeline({ data, loading: false, error: null });
    } catch (e: any) {
      setUploadPipeline({ data: null, loading: false, error: e.message || 'Failed to load' });
    }
  }, [range]);

  const fetchCostRealtime = useCallback(async () => {
    setCostRealtime((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const { data } = await api.admin.getCostRealtimeMetrics(range);
      setCostRealtime({ data, loading: false, error: null });
    } catch (e: any) {
      setCostRealtime({ data: null, loading: false, error: e.message || 'Failed to load' });
    }
  }, [range]);

  const fetchInfrastructure = useCallback(async () => {
    setInfrastructure((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const { data } = await api.admin.getInfrastructureMetrics(range);
      setInfrastructure({ data, loading: false, error: null });
    } catch (e: any) {
      setInfrastructure({ data: null, loading: false, error: e.message || 'Failed to load' });
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
