import { Icon } from "./Icons";
import { repoOptions } from "../data/settings";

const seeds = [
  {
    tag: "重构",
    text: "把 sseinternetvote 的征集时间窗判定重构进 `internal/collect/window.go`，与周边系统架构关系保持不变",
  },
  {
    tag: "排障",
    text: "多通道重复投票未按「时间优先」以第一次为准，定位 `internal/collect` 的判定根因并给出最小修复",
  },
  {
    tag: "测试",
    text: "为股东名册上传补齐边界用例，覆盖 `internal/upload/roster.go` 的格式与越权分支",
  },
  {
    tag: "阅读",
    text: "画出会议查询到通行证校验的调用链，指出 `internal/auth/ekey.go` 的权限与审计缺口",
  },
];

/* 仓库清单直接引用领域模型：源仓库与目标仓库的角色由数据层界定，界面不重复声明 */
const repos = repoOptions;

export function Welcome({ onStart }: { onStart: (v: string) => void }) {
  return (
    <div className="welcome">
      <div className="welcome__inner">
        <div className="welcome__hero">
          <span className="kicker">新任务</span>
          <h2 className="welcome__title serif">
            把工作<em>委派</em>出去，<br />
            再逐行审阅回来。
          </h2>
          <p className="welcome__lede">
            代理在隔离沙箱中读代码、改文件、跑测试。每一条会写入的命令都会先问过你。
          </p>
        </div>

        <div className="welcome__repos">
          <span className="kicker">选择仓库</span>
          <ul>
            {repos.map((r, i) => (
              <li key={r.name} style={{ ["--i" as string]: i }}>
                <button className="repo">
                  <i className="repo__dot" style={{ background: r.dot }} />
                  <span className="repo__name mono">sse/{r.name}</span>
                  <span className="repo__lang">{r.lang}</span>
                  <span className="repo__branch mono">
                    <Icon.Branch size={11} />
                    {r.branch}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="welcome__seeds">
          <span className="kicker">从一个意图开始</span>
          <div className="seedGrid">
            {seeds.map((s, i) => (
              <button
                key={s.tag}
                className="seed"
                style={{ ["--i" as string]: i }}
                onClick={() => onStart(s.text)}
              >
                <span className="seed__tag mono">{s.tag}</span>
                <span
                  className="seed__text"
                  dangerouslySetInnerHTML={{
                    __html: s.text.replace(
                      /`([^`]+)`/g,
                      '<code class="inline mono">$1</code>',
                    ),
                  }}
                />
                <Icon.Arrow size={14} className="seed__go" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
