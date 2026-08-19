import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App';
import { apiClient, USE_MOCK } from '@/core/data/apiClient';
import { setDataProvider } from '@/core/data/DataProvider';
import { restDataProvider } from '@/core/data/restDataProvider';
import { withRepeaterRelationships } from '@/resources/data/repeaterRelationships';
import { TooltipProvider } from '@/core/ui/tooltip';
import { Toaster } from '@/core/ui/notify';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error) => {
        const status = (error as { response?: { status?: number } }).response?.status;
        if (status && status >= 400 && status < 500) return false;
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
    },
  },
});

async function bootstrap() {
  if (USE_MOCK) {
    // Swapped at the transport layer so the REST provider and every custom
    // `apiClient` call in a resource work unchanged against the fixture data.
    const { mockAdapter } = await import('@/core/data/mock/mockAdapter');
    const { withMockPostBlocks } = await import('@/resources/data/mockPostBlocks');
    apiClient.defaults.adapter = withMockPostBlocks(mockAdapter);
  }

  // Fills and saves every `Repeater.relationship()` through the seven provider
  // methods, so a child table needs no endpoint of its own.
  setDataProvider(withRepeaterRelationships(restDataProvider));

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <TooltipProvider delayDuration={300}>
            <App />
            <Toaster />
          </TooltipProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </StrictMode>,
  );
}

void bootstrap();
