import { useEffect, useState } from 'react';
import { MarkdownRenderer, useToast } from '../../../shared/ui';
import type { WinStrategyState, WinStrategyStatus, WinThemePriority } from '../types';

interface WinStrategyPageProps {
  hasScoringCriteria: boolean;
}

type WinStrategyTab = 'themes' | 'score' | 'competitive';

const statusLabels: Record<WinStrategyStatus, string> = {
  idle: '未生成',
  running: '生成中',
  success: '已完成',
  error: '生成失败',
};

const priorityLabels: Record<WinThemePriority, string> = {
  high: '核心主题',
  medium: '重点主题',
  low: '辅助主题',
};

const tabs: Array<{ id: WinStrategyTab; label: string; hint: string }> = [
  { id: 'themes', label: '赢标主题表', hint: '为评委提炼"我们为什么值得中标"的核心信息（特色 + 证据 = 对评委的价值）。' },
  { id: 'score', label: '得分策略', hint: '逐条对照评分项，明确我方优势与拿分打法，把分值落到具体动作上。' },
  { id: 'competitive', label: '竞争差异打法', hint: '面向典型竞争对手类型放大差异化优势，不点名、不贬低真实公司。' },
];

function formatUpdatedAt(value?: string) {
  if (!value) return '';
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return '';
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false });
}

function WinStrategyPage({ hasScoringCriteria }: WinStrategyPageProps) {
  const { showToast } = useToast();
  const [strategy, setStrategy] = useState<WinStrategyState | null>(null);
  const [starting, setStarting] = useState(false);
  const [activeTab, setActiveTab] = useState<WinStrategyTab>('themes');

  useEffect(() => {
    let cancelled = false;
    void window.yibiao?.winStrategy.loadState()
      .then((state) => {
        if (!cancelled && state) setStrategy(state);
      })
      .catch((error) => {
        showToast(error instanceof Error ? error.message : '读取赢标策略缓存失败', 'error');
      });
    return () => {
      cancelled = true;
    };
  }, [showToast]);

  useEffect(() => {
    if (!window.yibiao?.tasks) {
      return;
    }

    const unsubscribe = window.yibiao.tasks.onTaskEvent((event) => {
      if (event.winStrategy) {
        setStrategy(event.winStrategy);
      }
    });

    void window.yibiao.tasks.getActiveTasks().catch((error) => {
      console.warn('获取赢标策略后台任务状态失败', error);
    });

    return unsubscribe;
  }, []);

  const task = strategy?.task;
  const running = starting || task?.status === 'running' || strategy?.status === 'running';
  const failed = !running && strategy?.status === 'error';
  const themes = strategy?.themes ?? [];
  const scoreStrategy = strategy?.scoreStrategy ?? [];
  const competitorPositioning = strategy?.competitorPositioning ?? [];
  const overview = strategy?.overview?.trim() || '';
  const hasResult = themes.length > 0 || scoreStrategy.length > 0 || competitorPositioning.length > 0;
  const statusKey: WinStrategyStatus = running ? 'running' : failed ? 'error' : hasResult ? 'success' : 'idle';
  const progress = running ? Math.max(5, Math.min(99, task?.progress || 5)) : hasResult ? 100 : 0;
  const latestLog = task?.logs?.[task.logs.length - 1] || '';
  const generatedAt = formatUpdatedAt(strategy?.generatedAt);

  const startGeneration = async () => {
    if (!hasScoringCriteria) {
      showToast('请先在"招标文件解析"中完成技术评分项解析', 'info');
      return;
    }
    if (running) return;

    try {
      setStarting(true);
      await window.yibiao?.tasks.startWinStrategy({});
      showToast('赢标策略生成任务已在后台启动', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '启动赢标策略生成失败', 'error');
    } finally {
      setStarting(false);
    }
  };

  const activeTabMeta = tabs.find((tab) => tab.id === activeTab) || tabs[0];

  return (
    <div className="plan-step-body win-strategy-page">
      <section className="global-facts-command-bar">
        <div>
          <span className="section-kicker">STEP 03</span>
          <strong>赢标策略</strong>
          <p>对照评分办法提炼赢标主题、得分打法和差异化策略，为目录和正文统一对准评委关注点。</p>
        </div>
        <div className="global-facts-stats">
          <span><strong>{themes.length}</strong> 个主题</span>
          <span><strong>{scoreStrategy.length}</strong> 个得分点</span>
          <span><strong>{competitorPositioning.length}</strong> 个差异点</span>
        </div>
        <button
          type="button"
          className="primary-action"
          onClick={startGeneration}
          disabled={running || !hasScoringCriteria}
        >
          {running ? '生成中...' : hasResult ? '重新生成' : '生成赢标策略'}
        </button>
      </section>

      <div className="win-strategy-scroll">
      {!hasScoringCriteria && (
        <section className="win-strategy-notice">
          <strong>还差一步：未检测到技术评分项</strong>
          <p>赢标策略需要基于评分办法生成。请先在"招标文件解析"步骤完成技术评分项解析，再回到本页生成策略。</p>
        </section>
      )}

      {(running || failed || generatedAt) && (
        <section className="win-strategy-progress">
          <div className="win-strategy-progress-head">
            <span className={`content-status-badge is-${statusKey}`}>{statusLabels[statusKey]}</span>
            {generatedAt && !running && <small>更新于 {generatedAt}</small>}
          </div>
          {(running || failed) && (
            <>
              <div className={`content-generation-progress-track${running ? ' is-active' : ''}`} aria-label={`赢标策略生成进度 ${progress}%`}>
                <span style={{ width: `${progress}%` }} />
              </div>
              <p>{failed ? (strategy?.error || latestLog || '赢标策略生成失败，请重试。') : (latestLog || strategy?.progressMessage || '正在分三轮生成赢标主题、得分策略与竞争差异打法...')}</p>
            </>
          )}
        </section>
      )}

      {hasResult ? (
        <section className="win-strategy-workspace">
          <div className="win-strategy-tabs" role="tablist" aria-label="赢标策略内容">
            {tabs.map((tab) => (
              <button
                type="button"
                key={tab.id}
                role="tab"
                aria-selected={tab.id === activeTab}
                className={`win-strategy-tab${tab.id === activeTab ? ' is-active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <strong>{tab.label}</strong>
                <small>
                  {tab.id === 'themes' ? `${themes.length} 项` : tab.id === 'score' ? `${scoreStrategy.length} 项` : `${competitorPositioning.length} 项`}
                </small>
              </button>
            ))}
          </div>

          <p className="win-strategy-tab-hint">{activeTabMeta.hint}</p>

          {activeTab === 'themes' && (
            themes.length ? (
              <div className="win-strategy-theme-grid">
                {themes.map((theme, index) => (
                  <article className="win-strategy-theme-card" key={theme.id}>
                    <header>
                      <span className="win-theme-index">主题 {index + 1}</span>
                      <span className={`win-theme-priority is-${theme.priority}`}>{priorityLabels[theme.priority]}</span>
                    </header>
                    <h4>{theme.title}</h4>
                    <dl>
                      <div>
                        <dt>支撑证据</dt>
                        <dd>{theme.evidence || '—'}</dd>
                      </div>
                      <div>
                        <dt>差异化亮点</dt>
                        <dd>{theme.differentiator || '—'}</dd>
                      </div>
                      <div>
                        <dt>对评委的价值</dt>
                        <dd>{theme.evaluatorBenefit || '—'}</dd>
                      </div>
                      {theme.linkedRequirement && (
                        <div>
                          <dt>对应评分项</dt>
                          <dd>{theme.linkedRequirement}</dd>
                        </div>
                      )}
                    </dl>
                  </article>
                ))}
              </div>
            ) : (
              <div className="win-strategy-empty">暂无赢标主题，可点击"重新生成"。</div>
            )
          )}

          {activeTab === 'score' && (
            scoreStrategy.length ? (
              <div className="win-strategy-table-wrap">
                <table className="win-strategy-table">
                  <thead>
                    <tr>
                      <th>评分项</th>
                      <th>分值</th>
                      <th>我方优势</th>
                      <th>拿分打法</th>
                      <th>风险提示</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scoreStrategy.map((row) => (
                      <tr key={row.id}>
                        <td>{row.item}</td>
                        <td className="win-strategy-weight">{row.weight || '—'}</td>
                        <td>{row.ourStrength || '—'}</td>
                        <td>{row.tactic || '—'}</td>
                        <td className="win-strategy-risk">{row.risk || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="win-strategy-empty">暂无得分策略，可点击"重新生成"。</div>
            )
          )}

          {activeTab === 'competitive' && (
            <div className="win-strategy-competitive">
              {overview && (
                <section className="win-strategy-overview markdown-viewer">
                  <span className="section-kicker">总体策略</span>
                  <MarkdownRenderer allowRawHtml={false}>{overview}</MarkdownRenderer>
                </section>
              )}
              {competitorPositioning.length ? (
                <div className="win-strategy-competitor-grid">
                  {competitorPositioning.map((row, index) => (
                    <article className="win-strategy-competitor-card" key={row.id}>
                      <header>
                        <span className="win-competitor-index">对手类型 {index + 1}</span>
                      </header>
                      <h4>{row.competitorType}</h4>
                      <dl>
                        <div>
                          <dt>常见短板</dt>
                          <dd>{row.weakness || '—'}</dd>
                        </div>
                        <div>
                          <dt>我方反制</dt>
                          <dd>{row.ourEdge || '—'}</dd>
                        </div>
                      </dl>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="win-strategy-empty">暂无竞争差异打法，可点击"重新生成"。</div>
              )}
            </div>
          )}
        </section>
      ) : (
        !running && (
          <section className="win-strategy-empty-state">
            <strong>{hasScoringCriteria ? '尚未生成赢标策略' : '完成评分项解析后即可生成'}</strong>
            <p>
              点击右上角"生成赢标策略"，AI 会分三轮产出：赢标主题表、逐项得分策略，以及面向典型竞争对手的差异化打法。
            </p>
          </section>
        )
      )}
      </div>
    </div>
  );
}

export default WinStrategyPage;
