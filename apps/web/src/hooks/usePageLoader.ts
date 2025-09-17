import { useState, useEffect } from 'react';

export const usePageLoader = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingPage, setLoadingPage] = useState<string | null>(null);

  const startLoading = (pageName: string) => {
    setIsLoading(true);
    setLoadingPage(pageName);
  };

  const stopLoading = () => {
    setIsLoading(false);
    setLoadingPage(null);
  };

  // Auto-stop loading after a maximum time
  useEffect(() => {
    if (isLoading) {
      const timer = setTimeout(() => {
        stopLoading();
      }, 3000); // Max 3 seconds

      return () => clearTimeout(timer);
    }
  }, [isLoading]);

  return {
    isLoading,
    loadingPage,
    startLoading,
    stopLoading
  };
};
