import { useState } from 'react';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import { AGENT_BADGE_LEGEND } from './agentBadges';

/**
 * 「标签说明」入口 + 弹窗：把卡片上的徽标一次讲清。
 * 徽标挂在卡片上时只能靠悬停看 title，用户往往不知道要悬停；
 * 这里给一个显式入口，把同一份解释（AGENT_BADGE_LEGEND）集中列出来。
 */
export default function BadgeLegend() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" title="卡片上这些标签分别是什么意思？" onClick={() => setOpen(true)}>
        标签说明
      </Button>
      <Modal
        open={open}
        title="卡片上的标签是什么意思？"
        width={620}
        onClose={() => setOpen(false)}
        footer={<Button variant="ghost" onClick={() => setOpen(false)}>知道了</Button>}
      >
        <div className="badge-legend">
          {AGENT_BADGE_LEGEND.map((it) => (
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
