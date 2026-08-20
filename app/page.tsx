"use client";

import { useState } from "react";

type View = "table" | "account";
type RecordTab = "funds" | "games";

const players = [
  { name: "阿哲", stack: "8,420", cards: "A♣ K♣", className: "seat top", status: "加注 320" },
  { name: "Mia", stack: "4,680", cards: "", className: "seat right", status: "跟注" },
  { name: "Old Fox", stack: "11,200", cards: "", className: "seat left", status: "弃牌" },
  { name: "Kai", stack: "6,740", cards: "", className: "seat bottom-left", status: "等待" },
  { name: "Lynn", stack: "9,060", cards: "", className: "seat bottom-right", status: "等待" },
];

const transactions = [
  { time: "今天 22:16", title: "牌局结算", detail: "#NLH-829104 · 午夜河牌", amount: "+¥1,680.00", balance: "¥12,840.00", kind: "win" },
  { time: "今天 21:04", title: "带入牌桌", detail: "#NLH-829104 · 午夜河牌", amount: "-¥2,000.00", balance: "¥11,160.00", kind: "out" },
  { time: "今天 18:32", title: "每日任务奖励", detail: "连续登录第 7 天", amount: "+¥188.00", balance: "¥13,160.00", kind: "win" },
  { time: "8月19日 23:48", title: "牌局结算", detail: "#NLH-828775 · 深夜食堂", amount: "-¥760.00", balance: "¥12,972.00", kind: "loss" },
  { time: "8月19日 20:12", title: "账户充值", detail: "银联卡 · 尾号 0826", amount: "+¥5,000.00", balance: "¥13,732.00", kind: "win" },
  { time: "8月18日 14:06", title: "余额提现", detail: "处理中 · 预计 1 个工作日", amount: "-¥3,000.00", balance: "¥8,732.00", kind: "out" },
];

const games = [
  { time: "今天 22:16", room: "午夜河牌", stakes: "¥10 / ¥20", hands: "42", buyin: "¥2,000", result: "+¥1,680", kind: "win" },
  { time: "8月19日 23:48", room: "深夜食堂", stakes: "¥5 / ¥10", hands: "87", buyin: "¥2,000", result: "-¥760", kind: "loss" },
  { time: "8月18日 01:20", room: "海港之夜", stakes: "¥10 / ¥20", hands: "64", buyin: "¥4,000", result: "+¥2,320", kind: "win" },
  { time: "8月16日 21:42", room: "周末快桌", stakes: "¥2 / ¥5", hands: "118", buyin: "¥1,000", result: "+¥485", kind: "win" },
  { time: "8月15日 20:08", room: "翡翠厅", stakes: "¥5 / ¥10", hands: "51", buyin: "¥2,000", result: "-¥1,120", kind: "loss" },
];

const chartData = [
  { day: "周四", value: 32, label: "+320" },
  { day: "周五", value: 61, label: "+610" },
  { day: "周六", value: -28, label: "-280" },
  { day: "周日", value: 86, label: "+860" },
  { day: "周一", value: 48, label: "+480" },
  { day: "周二", value: -41, label: "-410" },
  { day: "今天", value: 100, label: "+1,680" },
];

export default function Home() {
  const [view, setView] = useState<View>("table");
  const [recordTab, setRecordTab] = useState<RecordTab>("funds");
  const [showRaise, setShowRaise] = useState(false);
  const [raiseAmount, setRaiseAmount] = useState(800);
  const [notice, setNotice] = useState("");

  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2200);
  };

  const openRecords = (tab: RecordTab) => {
    setRecordTab(tab);
    setView("account");
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setView("table")} aria-label="River 德州扑克首页">
          <span className="brand-mark">R</span>
          <span>RIVER <small>德扑竞技</small></span>
        </button>
        <nav className="main-nav" aria-label="主导航">
          <button className={view === "table" ? "active" : ""} onClick={() => setView("table")}>牌桌</button>
          <button className={view === "account" ? "active" : ""} onClick={() => openRecords("games")}>战绩</button>
          <button onClick={() => flash("俱乐部功能即将开放")}>俱乐部</button>
        </nav>
        <button className="account-chip" onClick={() => openRecords("funds")} aria-label="打开账户记录">
          <span className="status-dot" />
          <span><small>可用筹码</small><b>¥ 12,840.00</b></span>
          <span className="avatar">陈</span>
        </button>
      </header>

      {view === "table" ? (
        <section className="game-layout">
          <aside className="left-panel panel">
            <p className="eyebrow">现金桌 · NLH</p>
            <h1>午夜河牌</h1>
            <div className="room-meta"><span>6 人桌</span><span>¥10 / ¥20</span></div>
            <div className="divider" />
            <p className="label">本桌统计</p>
            <div className="stat-grid">
              <div><strong>42</strong><span>手牌</span></div>
              <div><strong className="gain">+1,680</strong><span>盈亏</span></div>
            </div>
            <div className="session-progress">
              <span><b>VPIP</b><em>28%</em></span>
              <div><i style={{ width: "28%" }} /></div>
              <span><b>PFR</b><em>19%</em></span>
              <div><i style={{ width: "19%" }} /></div>
            </div>
            <div className="tip-card">
              <span>牌桌提示</span>
              <p>你在按钮位，当前拥有位置优势。</p>
            </div>
            <button className="leave-button" onClick={() => flash("已为你保留座位 30 秒")}>暂离牌桌</button>
          </aside>

          <section className="table-stage" aria-label="德州扑克牌桌">
            <div className="hand-code">#829104 <span>·</span> 第 42 手</div>
            <div className="table-light" />
            <div className="poker-table">
              <div className="felt-ring" />
              <span className="watermark">RIVER</span>
              {players.map((player) => (
                <div className={player.className} key={player.name}>
                  <div className="mini-avatar">{player.name.slice(0, 1)}</div>
                  <div><b>{player.name}</b><span>¥{player.stack}</span></div>
                  <i className={player.status === "弃牌" ? "folded" : ""}>{player.status}</i>
                  {player.cards && <em>{player.cards}</em>}
                </div>
              ))}
              <div className="pot"><span>底池</span><strong>¥ 1,240</strong></div>
              <div className="community-cards" aria-label="公共牌">
                <div><b>10</b><span>♠</span></div>
                <div className="red"><b>J</b><span>♥</span></div>
                <div><b>Q</b><span>♣</span></div>
                <div className="red"><b>4</b><span>♦</span></div>
                <div className="card-back">?</div>
              </div>
              <div className="dealer-chip">D</div>
              <div className="hero-seat">
                <div className="hole-cards">
                  <div className="red"><b>A</b><span>♥</span></div>
                  <div><b>K</b><span>♠</span></div>
                </div>
                <div className="hero-info"><b>我</b><span>¥12,840</span></div>
              </div>
            </div>

            <div className="action-bar">
              <div className="action-copy"><span>轮到你行动 <i /></span><b>跟注 ¥320</b></div>
              <div className="action-buttons">
                <button className="ghost" onClick={() => flash("你选择了弃牌")}>弃牌</button>
                <button className="ghost" onClick={() => flash("本轮不可过牌")}>过牌</button>
                <button className="primary" onClick={() => flash("跟注 ¥320 · 等待其他玩家")}>跟注 · ¥320</button>
                <button className={showRaise ? "raise selected" : "raise"} onClick={() => setShowRaise(!showRaise)}>加注</button>
              </div>
              {showRaise && (
                <div className="raise-tray">
                  <div className="raise-head"><span>加注金额</span><b>¥{raiseAmount.toLocaleString()}</b></div>
                  <input aria-label="选择加注金额" type="range" min="640" max="4000" step="20" value={raiseAmount} onChange={(event) => setRaiseAmount(Number(event.target.value))} />
                  <div className="quick-bets">
                    <button onClick={() => setRaiseAmount(640)}>最小</button>
                    <button onClick={() => setRaiseAmount(930)}>3/4 底池</button>
                    <button onClick={() => setRaiseAmount(1240)}>满池</button>
                    <button onClick={() => setRaiseAmount(4000)}>全下</button>
                    <button className="confirm-bet" onClick={() => { setShowRaise(false); flash(`已加注至 ¥${raiseAmount.toLocaleString()}`); }}>确认加注</button>
                  </div>
                </div>
              )}
            </div>
          </section>

          <aside className="right-panel panel">
            <p className="eyebrow">本手牌</p>
            <h2>顺子听牌</h2>
            <div className="equity"><div><span style={{ width: "68%" }} /></div><b>68%</b></div>
            <p className="muted">预计胜率 · 还有 1 张牌</p>
            <div className="hand-outs">
              <span><b>8</b><small>有效补牌</small></span>
              <span><b>2.1 : 1</b><small>底池赔率</small></span>
            </div>
            <div className="divider" />
            <div className="activity-title"><span>牌桌动态</span><button onClick={() => openRecords("games")}>全部记录</button></div>
            <ul className="activity-list">
              <li><span className="activity-icon">♠</span><p><b>阿哲</b> 加注到 ¥320<small>刚刚</small></p></li>
              <li><span className="activity-icon">●</span><p><b>Mia</b> 跟注 ¥320<small>8 秒前</small></p></li>
              <li><span className="activity-icon muted-icon">×</span><p><b>Old Fox</b> 弃牌<small>12 秒前</small></p></li>
              <li><span className="activity-icon gold-icon">D</span><p><b>系统</b> 发出转牌 4♦<small>19 秒前</small></p></li>
            </ul>
          </aside>
        </section>
      ) : (
        <section className="account-page">
          <div className="account-heading">
            <div>
              <button className="back-link" onClick={() => setView("table")}>← 返回牌桌</button>
              <p className="eyebrow">ACCOUNT CENTER</p>
              <h1>账户与记录</h1>
              <p>查看资金变化、牌局表现与结算明细。</p>
            </div>
            <div className="account-actions">
              <button onClick={() => flash("充值通道为演示功能")}>充值</button>
              <button className="outline" onClick={() => flash("提现申请为演示功能")}>提现</button>
            </div>
          </div>

          <div className="summary-grid">
            <article className="summary-card balance-card">
              <span>总账户余额</span>
              <strong>¥ 12,840.00</strong>
              <small><i /> 资金账户正常</small>
              <b className="card-symbol">¥</b>
            </article>
            <article className="summary-card">
              <span>近 30 天盈亏</span>
              <strong className="gain">+¥ 4,268.00</strong>
              <small className="positive-pill">↑ 18.6%</small>
            </article>
            <article className="summary-card">
              <span>总牌局场次</span>
              <strong>126 <em>场</em></strong>
              <small>3,842 手牌 · 胜率 56%</small>
            </article>
            <article className="summary-card">
              <span>当前等级</span>
              <strong className="gold-text">River III</strong>
              <small>距下一等级还需 1,480 XP</small>
            </article>
          </div>

          <div className="account-content-grid">
            <article className="performance-card">
              <div className="card-heading">
                <div><p className="eyebrow">PERFORMANCE</p><h2>近 7 天盈亏</h2></div>
                <strong>+¥3,260 <small>本周</small></strong>
              </div>
              <div className="chart" aria-label="近七天盈亏柱状图">
                <div className="zero-line" />
                {chartData.map((item) => (
                  <div className="chart-column" key={item.day}>
                    <span className={`bar-value ${item.value < 0 ? "negative" : ""}`}>{item.label}</span>
                    <div className={`chart-bar ${item.value < 0 ? "down" : ""}`} style={{ height: `${Math.abs(item.value) * .72}px` }} />
                    <small>{item.day}</small>
                  </div>
                ))}
              </div>
            </article>
            <aside className="profile-card">
              <div className="profile-top"><span className="profile-avatar">陈</span><div><b>陈先生</b><small>ID 8829 4106</small></div><i>已认证</i></div>
              <dl>
                <div><dt>常玩级别</dt><dd>¥5 / ¥10</dd></div>
                <div><dt>最大单场盈利</dt><dd className="gain">+¥6,420</dd></div>
                <div><dt>入池率 VPIP</dt><dd>27.8%</dd></div>
              </dl>
              <button onClick={() => flash("个人资料功能即将开放")}>管理账户 →</button>
            </aside>
          </div>

          <article className="records-card">
            <div className="records-toolbar">
              <div className="record-tabs" role="tablist" aria-label="记录类型">
                <button role="tab" aria-selected={recordTab === "funds"} className={recordTab === "funds" ? "active" : ""} onClick={() => setRecordTab("funds")}>资金流水</button>
                <button role="tab" aria-selected={recordTab === "games"} className={recordTab === "games" ? "active" : ""} onClick={() => setRecordTab("games")}>牌局记录</button>
              </div>
              <select aria-label="记录时间范围" defaultValue="30"><option value="7">近 7 天</option><option value="30">近 30 天</option><option value="90">近 3 个月</option></select>
            </div>

            {recordTab === "funds" ? (
              <div className="record-table funds-table" role="table" aria-label="资金流水">
                <div className="table-row table-head" role="row"><span>时间</span><span>类型 / 说明</span><span>金额</span><span>余额</span></div>
                {transactions.map((item) => (
                  <div className="table-row" role="row" key={`${item.time}-${item.title}`}>
                    <span className="time-cell">{item.time}</span>
                    <span className="record-name"><i className={item.kind}>{item.kind === "win" ? "+" : "−"}</i><b>{item.title}<small>{item.detail}</small></b></span>
                    <strong className={item.kind === "win" ? "gain" : item.kind === "loss" ? "loss" : ""}>{item.amount}</strong>
                    <span>{item.balance}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="record-table games-table" role="table" aria-label="牌局记录">
                <div className="table-row table-head" role="row"><span>时间</span><span>牌桌</span><span>级别</span><span>手牌</span><span>带入</span><span>结果</span></div>
                {games.map((game) => (
                  <button className="table-row" role="row" key={`${game.time}-${game.room}`} onClick={() => flash(`${game.room} · 牌局详情为演示数据`)}>
                    <span className="time-cell">{game.time}</span><span className="room-cell"><i>♠</i>{game.room}</span><span>{game.stakes}</span><span>{game.hands}</span><span>{game.buyin}</span><strong className={game.kind === "win" ? "gain" : "loss"}>{game.result}</strong>
                  </button>
                ))}
              </div>
            )}
            <div className="table-footer"><span>显示最近 {recordTab === "funds" ? transactions.length : games.length} 条记录</span><button onClick={() => flash("没有更多记录了")}>加载更多</button></div>
          </article>
        </section>
      )}

      <div className={`toast ${notice ? "show" : ""}`} aria-live="polite"><span>✓</span>{notice}</div>
    </main>
  );
}
