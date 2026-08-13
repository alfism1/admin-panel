import { toast, Toaster as SonnerToaster } from 'sonner';
import { useTheme } from '@/core/ui/useTheme';

export interface NotifyOptions {
  title: string;
  description?: string;
  type?: 'success' | 'error' | 'info' | 'warning';
  duration?: number;
}

export const notify = {
  success: (title: string, description?: string) => toast.success(title, { description }),
  error: (title: string, description?: string) => toast.error(title, { description }),
  info: (title: string, description?: string) => toast.info(title, { description }),
  warning: (title: string, description?: string) => toast.warning(title, { description }),
  show: ({ title, description, type = 'info', duration }: NotifyOptions) =>
    toast[type](title, { description, duration }),
};

export function Toaster() {
  const { resolvedTheme } = useTheme();
  return (
    <SonnerToaster
      theme={resolvedTheme}
      position="top-right"
      richColors
      closeButton
      toastOptions={{ classNames: { toast: 'rounded-lg' } }}
    />
  );
}
