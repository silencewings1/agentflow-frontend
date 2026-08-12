import { Icon } from "./Icons";

const seeds = [
  {
    tag: "重构",
    text: "把 `useDashboard` 里的数据获取逻辑抽成独立 hook，并保持 SSR 行为一致",
  },
  { tag: "排障", text: "CI 上 `snapshot.spec.ts` 偶发失败，定位根因并给出最小修复" },
  { tag: "测试", text: "为 billing 的退款分支补齐边界用例，覆盖率提到 90% 以上" },
  { tag: "阅读", text: "画出 auth 模块的调用链，并指出可能的循环依赖" },
];

const repos = [
  { name: "atlas-api", lang: "TypeScript", branch: "main", dot: "var(--azure)" },
  { name: "atlas-web", lang: "TypeScript", branch: "main", dot: "var(--gold)" },
  { name: "infra", lang: "HCL", branch: "prod", dot: "var(--sage)" },
  { name: "design-kit", lang: "CSS", branch: "main", dot: "var(--plum)" },
];

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
                  <span className="repo__name mono">agentflow/{r.name}</span>
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
