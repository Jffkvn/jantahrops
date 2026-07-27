import { Toaster as Sonner } from 'sonner';

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-surface group-[.toaster]:text-ink group-[.toaster]:border-border group-[.toaster]:shadow-float group-[.toaster]:rounded-control font-body text-sm',
          description: 'group-[.toast]:text-ink-secondary',
          actionButton:
            'group-[.toast]:bg-primary group-[.toast]:text-primary-ink font-medium text-xs rounded-control',
          cancelButton:
            'group-[.toast]:bg-surface-sunken group-[.toast]:text-ink font-medium text-xs rounded-control',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
