import * as React from 'react';

const MESSAGE = 'You have unsaved changes. Leave this page and discard them?';

/**
 * React Router's declarative mode has no `useBlocker`, so in-app navigation is
 * caught by intercepting anchor clicks during the capture phase, and reload /
 * tab-close by `beforeunload`. Programmatic `navigate()` calls inside the app
 * go through `confirmDiscard()`.
 */
export function useUnsavedChangesGuard(dirty: boolean): void {
  React.useEffect(() => {
    if (!dirty) return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    const onClickCapture = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey) return;

      const anchor = (event.target as HTMLElement | null)?.closest('a');
      if (!anchor) return;

      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#') || anchor.target === '_blank') return;
      if (href === window.location.pathname + window.location.search) return;

      if (!window.confirm(MESSAGE)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClickCapture, true);

    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClickCapture, true);
    };
  }, [dirty]);
}

export function confirmDiscard(dirty: boolean): boolean {
  return !dirty || window.confirm(MESSAGE);
}
