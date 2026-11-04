import type { ReactNode } from 'react';
import { useEffect, useId, useRef } from 'react';
import Button from './Button';
import Icon from './Icon';
import { useI18n } from '../../i18n';

interface ModalProps {
  open: boolean;
  title?: ReactNode;
  onClose?: () => void;
  footer?: ReactNode;
  children: ReactNode;
  width?: number;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function Modal({ open, title, onClose, footer, children, width }: Readonly<ModalProps>) {
  const { t } = useI18n();
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    // 打开即把焦点收进弹窗：键盘用户不会继续在背后的页面上游走
    const first = dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? dialogRef.current)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose?.();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const nodes = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (n) => n.offsetParent !== null
      );
      if (nodes.length === 0) return;
      const head = nodes[0];
      const tail = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === head) {
        e.preventDefault();
        tail.focus();
      } else if (!e.shiftKey && document.activeElement === tail) {
        e.preventDefault();
        head.focus();
      }
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
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div ref={backdropRef} className="modal-backdrop">
      <div
        ref={dialogRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={title !== undefined ? titleId : undefined}
        tabIndex={-1}
        style={width ? { width: `min(${width}px, 100%)` } : undefined}
      >
        {title !== undefined && (
          <div className="modal__head">
            <h3 className="modal__title" id={titleId}>
              {title}
            </h3>
            {onClose && (
              <div className="modal__close">
                <Button variant="ghost" size="sm" onClick={onClose} aria-label={t('common.close')} title={t('common.close')}>
                  <Icon name="close" size={14} />
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
