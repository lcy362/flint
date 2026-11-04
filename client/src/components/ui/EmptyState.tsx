import type { ReactNode } from 'react';
import Icon, { iconFromGlyph } from './Icon';

export default function EmptyState({
  title,
  hint,
  action,
  icon,
}: Readonly<{
  title?: string;
  hint?: ReactNode;
  action?: ReactNode;
  icon?: string;
}>) {
  return (
    <div className="empty">
      <span className="empty__mark" aria-hidden="true">
        <Icon name={iconFromGlyph(icon)} size={40} strokeWidth={1} />
      </span>
      {title && <div className="empty__title">{title}</div>}
      {hint && <div className="empty__hint">{hint}</div>}
      {action && <div className="empty__action">{action}</div>}
    </div>
  );
}
