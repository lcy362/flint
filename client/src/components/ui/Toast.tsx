import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

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

const TOAST_TTL = 3200;

let seq = 0;

export function ToastProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  /** 未到期的自动消失计时器：卸载时要一起清掉，否则它们会在组件树销毁后才触发 setState */
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((handle) => clearTimeout(handle));
      pending.clear();
    };
  }, []);

  const push = useCallback((text: string, kind: Kind = 'info') => {
    const id = ++seq;
    setToasts((t) => [...t, { id, text, kind }]);
    const handle = setTimeout(() => {
      timers.current.delete(handle);
      setToasts((t) => t.filter((x) => x.id !== id));
    }, TOAST_TTL);
    timers.current.add(handle);
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
