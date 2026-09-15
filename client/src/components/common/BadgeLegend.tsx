import type { ReactNode } from 'react';
import { useState } from 'react';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import { useI18n } from '../../i18n';

export type BadgeTone = 'neutral' | 'accent' | 'good' | 'warn' | 'bad' | 'info';

export interface BadgeLegendItem {
  label: string;
  tone: BadgeTone;
  dot?: 'good' | 'warn' | 'bad' | 'neutral';
  desc: string;
}

/**
 * 「标签说明」入口 + 弹窗：把卡片上的徽标一次讲清。
 *
 * 徽标挂在卡片上时只能靠悬停看 title，而用户往往不知道要悬停；这里给一个显式入口，
 * 把同一份解释集中列出来（各页的图例数据与徽标本体共用同一份文案，不会各说各话）。
 */
export default function BadgeLegend({
  title,
  intro,
  items,
  triggerLabel,
}: {
  /** 弹窗标题 */
  title: string;
  /** 弹窗顶部的总说明 */
  intro: ReactNode;
  items: BadgeLegendItem[];
  /** 入口按钮文字（缺省用通用「标签说明」） */
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();
  return (
    <>
      <Button variant="ghost" size="sm" title={title} onClick={() => setOpen(true)}>
        {triggerLabel ?? t('badge.legend.trigger')}
      </Button>
      <Modal
        open={open}
        title={title}
        width={620}
        onClose={() => setOpen(false)}
        footer={<Button variant="ghost" onClick={() => setOpen(false)}>{t('common.ok')}</Button>}
      >
        <p className="badge-legend__intro">{intro}</p>
        <div className="badge-legend">
          {items.map((it) => (
            <div className="badge-legend__row" key={it.label}>
              <span className="badge-legend__tag">
                <Badge tone={it.tone} dot={it.dot}>{it.label}</Badge>
              </span>
              <span className="badge-legend__desc">{it.desc}</span>
            </div>
          ))}
        </div>
      </Modal>
    </>
  );
}
