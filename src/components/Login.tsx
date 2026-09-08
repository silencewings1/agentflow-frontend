import { useState } from "react";
import { Icon } from "./Icons";
import {
  accounts,
  accountById,
  accountLayerLabel,
  type Account,
} from "../data/accounts";

const LAYER_ORDER: Account["layer"][] = ["L1", "L2", "L3", "L4", "L5"];

export function Login({ onLogin }: { onLogin: (accountId: string) => void }) {
  const [selId, setSelId] = useState<string>("ac-yz");

  const activeAccounts = accounts.filter((a) => a.state === "active");
  const listByLayer = (layer: Account["layer"]) =>
    activeAccounts.filter((a) => a.layer === layer);

  const selected = accountById(selId, accounts);

  return (
    <div className="login">
      <div className="login__glow" aria-hidden />
      <div className="login__card">
        <div className="login__brand">
          <Icon.Logo size={28} className="login__logo" />
          <span className="kicker">AgentFlow</span>
        </div>
        <h1 className="serif login__title">选择登录账户</h1>
        <p className="login__sub">
          不同账户对应不同的节点操作权限，登录后可以查看完整 DAG 编排图。
        </p>

        <div className="login__accounts">
          {LAYER_ORDER.flatMap((layer) => {
            const rows = listByLayer(layer);
            if (!rows.length) return [];
            return [
              <div key={`hd-${layer}`} className="loginAccounts__groupHead">
                <span className="kicker">{layer}</span>
                <span className="loginAccounts__groupLabel">{accountLayerLabel[layer]}</span>
              </div>,
              ...rows.map((a, i) => (
                <button
                  key={a.id}
                  className="loginAccount"
                  data-on={selId === a.id ? "true" : undefined}
                  style={{ "--i": i } as React.CSSProperties}
                  onClick={() => setSelId(a.id)}
                >
                  <span className="loginAccount__glyph" data-tint={a.tint}>
                    {(() => {
                      const G = Icon[a.glyph];
                      return <G size={18} />;
                    })()}
                  </span>
                  <span className="loginAccount__body">
                    <b>{a.name}</b>
                    <i className="mono">{a.handle}</i>
                  </span>
                  <span className="loginAccount__layer">
                    {a.layer} · {accountLayerLabel[a.layer]}
                  </span>
                </button>
              )),
            ];
          })}
        </div>

        <button
          className="btn btn--accent login__btn"
          disabled={!selected}
          onClick={() => selected && onLogin(selected.id)}
        >
          <Icon.Sparkle size={14} />
          登录
          {selected && ` · ${selected.name}`}
        </button>

        <p className="login__foot">
          登录后可在左下角退出当前账户，或在「成员与权限」中查看全部账户。
        </p>
      </div>
    </div>
  );
}
