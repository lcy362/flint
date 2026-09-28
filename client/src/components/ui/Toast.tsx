import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

type Kind = 'good' | 'bad' | 'info';
interface ToastMsg {
  id: number;
  text: string;
  kind: Kind;
}

interface ToastCtx {
  push: (text: string, kind?: Kind) => void;
}

const Ctx = createContext<ToastCtx>({ push: () => {} });

let seq = 0;

export function ToastProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const push = useCallback((text: string, kind: Kind = 'info') => {
    const id = ++seq;
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);
  // 包一层 useMemo：否则每次渲染都新建对象，Provider 的消费者会被无谓地全部重渲染
  const ctx = useMemo(() => ({ push }), [push]);
  return (
    <Ctx.Provider value={ctx}>
      {children}
      <div className="toast-wrap">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.kind}`}>
            <span className={`dot dot--${t.kind === 'info' ? 'neutral' : t.kind}`} />
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.text}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastCtx {
  return useContext(Ctx);
}