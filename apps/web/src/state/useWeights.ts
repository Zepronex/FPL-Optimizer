import { useState, useCallback, useEffect } from 'react';
import { AnalysisWeights, WeightPreset } from '../lib/types';
import { apiClient } from '../lib/api';

const defaultWeights: AnalysisWeights = {
  form: 0.2,
  xg90: 0.15,
  xa90: 0.15,
  expMin: 0.15,
  next3Ease: 0.1,
  avgPoints: 0.15,
  value: 0.05,
  ownership: 0.05
};

const WEIGHTS_STORAGE_KEY = 'scoutiq-weights';
const LEGACY_WEIGHTS_STORAGE_KEY = 'fpl-optimizer-weights';

export const useWeights = () => {
  const [weights, setWeights] = useState<AnalysisWeights>(defaultWeights);
  const [presets, setPresets] = useState<WeightPreset[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load weights from localStorage on mount
  useEffect(() => {
    const savedWeights = localStorage.getItem(WEIGHTS_STORAGE_KEY) ?? localStorage.getItem(LEGACY_WEIGHTS_STORAGE_KEY);
    if (savedWeights) {
      try {
        const parsed = JSON.parse(savedWeights);
        setWeights(parsed);
        localStorage.setItem(WEIGHTS_STORAGE_KEY, JSON.stringify(parsed));
        localStorage.removeItem(LEGACY_WEIGHTS_STORAGE_KEY);
      } catch {
        // Failed to parse saved weights, using defaults
      }
    }
  }, []);

  // Load presets on mount
  useEffect(() => {
    const loadPresets = async () => {
      try {
        const response = await apiClient.getWeightPresets();
        if (response.success && response.data) {
          setPresets(response.data);
        }
      } catch {
        // Failed to load presets
      }
    };
    loadPresets();
  }, []);

  // Save weights to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem(WEIGHTS_STORAGE_KEY, JSON.stringify(weights));
  }, [weights]);

  const updateWeight = useCallback((key: keyof AnalysisWeights, value: number) => {
    setWeights(prev => ({
      ...prev,
      [key]: Math.max(0, Math.min(1, value)) // Clamp between 0 and 1
    }));
  }, []);

  const resetToDefaults = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await apiClient.getDefaultWeights();
      if (response.success && response.data) {
        setWeights(response.data);
      } else {
        setWeights(defaultWeights);
      }
    } catch {
      setError('Failed to load default weights');
      setWeights(defaultWeights);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const normalizeWeights = useCallback(() => {
    setWeights(prev => {
      const total = Object.values(prev).reduce((sum, weight) => sum + weight, 0);
      if (total === 0) return prev;
      
      const normalized: AnalysisWeights = {} as AnalysisWeights;
      Object.keys(prev).forEach(key => {
        normalized[key as keyof AnalysisWeights] = prev[key as keyof AnalysisWeights] / total;
      });
      
      return normalized;
    });
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const applyPreset = useCallback((preset: WeightPreset) => {
    setWeights(preset.weights);
  }, []);

  return {
    weights,
    presets,
    isLoading,
    error,
    updateWeight,
    resetToDefaults,
    normalizeWeights,
    clearError,
    applyPreset
  };
};

