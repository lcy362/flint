import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import Button from './Button';

interface ModalProps {
  open: boolean;
  title?: ReactNode;
  onClose?: () => void;
  footer?: ReactNode;
  children: ReactNode;
  width?: number;
}

export default function Modal({ open, title, onClose, footer, children, width }: Readonly<ModalProps>) {
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose?.();
    };
    // 点遮罩空白处关闭：监听挂在 document 上，而不是给非交互元素绑事件处理器（无障碍要求）
    const onDown = (e: MouseEvent) => {
      if (e.target === backdropRef.current) onClose?.();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div ref={backdropRef} className="modal-backdrop">
      <div className="modal" style={width ? { width: `min(${width}px, 100%)` } : undefined}>
        {title !== undefined && (
          <div className="modal__head">
            <h3 className="modal__title">{title}</h3>
            {onClose && (
              <div className="modal__close">
                <Button variant="ghost" size="sm" onClick={onClose}>
                  ✕
                </Button>
              </div>
            )}
          </div>
        )}
        <div className="modal__body">{children}</div>
        {footer !== undefined && <div className="modal__foot">{footer}</div>}
      </div>
    </div>
  );
}
