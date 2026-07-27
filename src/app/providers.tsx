import type { JSX, ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import { ThemeProvider } from './theme-provider';
import { Toaster } from '@/components/ui/toast';
import { router } from './router';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

interface ProvidersProps {
  children?: ReactNode;
}

export function Providers({ children }: ProvidersProps): JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        {children ?? <RouterProvider router={router} />}
        <Toaster />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default Providers;
