import { EntityCard, type EntityItem } from '../common/EntityList';
import Icon from '../ui/Icon';

/**
 * 开源生态推荐目录的「置顶特写」。
 *
 * 它在任何目录列表里都固定占第一行、独占一整行、面积比普通卡片大：
 * 这是绝大多数 Agent 共同读取的目录，值得一个单独的位置。后面接一条分割线，
 * 把「只想投给某个特定 Agent 时，才去下面找它自己的目录」这件事讲清楚——
 * 否则用户会以为下面那一堆目录是同等的选项。
 *
 * 卡片本体复用 EntityCard（含点击、开关、徽标），这里只做版式放大与分割线，
 * 保证与其它目录卡片的语义完全一致。
 */
export default function StandardDirBlock({
  item,
  note,
  divider,
}: Readonly<{
  item: EntityItem;
  /** 正文下方的一句话说明（列举主流 Agent） */
  note: string;
  /** 分割线右侧的指引文字 */
  divider: string;
}>) {
  return (
    <div className="standard-block">
      <EntityCard
        item={{
          ...item,
          desc: (
            <>
              {item.desc}
              <span className="standard-block__note">{note}</span>
            </>
          ),
        }}
      />
      <div className="standard-block__divider">
        <Icon name="chevron-down" size={13} />
        <span className="standard-block__hint">{divider}</span>
      </div>
    </div>
  );
}
