import { useEffect, useState, type ReactNode } from 'react';
import Spinner from './Spinner';
import EmptyState from './EmptyState';
import { useI18n } from '../../i18n';

interface LoadingBoundaryProps<T> {
  state: { loading: boolean; error?: string | null; data?: T | null };
  empty?: { title?: string; hint?: ReactNode; action?: ReactNode; icon?: string };
  children: (data: T) => ReactNode;
}

export default function LoadingBoundary<T>({ state, empty, children }: LoadingBoundaryProps<T>) {
  const { t } = useI18n();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (state.loading && !mounted) return <Spinner />;
  if (state.error) {
    return (
      <div className="error-box" role="alert">
        <b>{t('common.loadFailed')}</b> {state.error}
      </div>
    );
  }
  if (state.data === null || state.data === undefined) return <Spinner />;
  const isEmpty = Array.isArray(state.data) ? state.data.length === 0 : false;
  if (isEmpty && empty) return <EmptyState {...empty} />;
  return <>{children(state.data)}</>;
}