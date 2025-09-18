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

export const useWeights = () => {
  const [weights, setWeights] = useState<AnalysisWeights>(defaultWeights);
  const [presets, setPresets] = useState<WeightPreset[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load weights from localStorage on mount
  useEffect(() => {
    const savedWeights = localStorage.getItem('fpl-optimizer-weights');
    if (savedWeights) {
      try {
        const parsed = JSON.parse(savedWeights);
        setWeights(parsed);
      } catch (err) {
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
      } catch (err) {
        console.error('Failed to load presets:', err);
        // Failed to load presets
      }
    };
    loadPresets();
  }, []);

  // Save weights to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('fpl-optimizer-weights', JSON.stringify(weights));
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
    } catch (err) {
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

  const getPresetByName = useCallback((name: string): WeightPreset | undefined => {
    return presets.find(preset => preset.name === name);
  }, [presets]);

  return {
    weights,
    presets,
    isLoading,
    error,
    updateWeight,
    resetToDefaults,
    normalizeWeights,
    clearError,
    applyPreset,
    getPresetByName
  };
};

