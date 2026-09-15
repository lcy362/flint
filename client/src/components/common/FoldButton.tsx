import { useI18n } from '../../i18n';

/**
 * 面板折叠按钮：箭头随展开态旋转，折叠后头部仍保留计数供快速判读。
 * 预设详情与智能体详情等「可写面板」共用，保证交互一致。
 */
export default function FoldButton({ expanded, label, onClick }: { expanded: boolean; label: string; onClick: () => void }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      className="panel__fold"
      aria-expanded={expanded}
      aria-label={expanded ? t('fold.collapse', { label }) : t('fold.expand', { label })}
      onClick={onClick}
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
