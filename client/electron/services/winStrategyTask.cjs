const crypto = require('node:crypto');
const { compactLogError, createNoopDeveloperLogger, textMetrics } = require('../utils/developerLog.cjs');

function now() {
  return new Date().toISOString();
}

function createId(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

function normalizeText(value) {
  return String(value || '').trim();
}

function getArrayPayload(parsed, keys) {
  if (Array.isArray(parsed)) return parsed;
  if (!parsed || typeof parsed !== 'object') return [];
  for (const key of keys) {
    if (Array.isArray(parsed[key])) return parsed[key];
  }
  return [];
}

function normalizePriority(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'high' || raw.includes('高') || raw.includes('核心')) return 'high';
  if (raw === 'low' || raw.includes('低')) return 'low';
  return 'medium';
}

function buildInputContextMessages(inputs) {
  const messages = [];
  const projectLine = inputs.projectName ? `项目名称：${inputs.projectName}\n` : '';
  messages.push({
    role: 'user',
    content: `【赢标策略输入 v1｜评分项与评分标准】
以下是从招标文件解析出的技术/综合评分项、权重分值与评分标准。后续所有策略必须紧扣这些评分项，优先围绕权重高、主观打分空间大的项目展开。
${projectLine}
${inputs.techRequirements}`,
  });

  if (inputs.evaluationBid?.trim()) {
    messages.push({
      role: 'user',
      content: `【赢标策略输入 v1｜评标办法】
以下是评标委员会构成、评分方法与定标原则，用于判断哪些项目是主观分、哪些是客观分、如何避免低级失分。

${inputs.evaluationBid.trim()}`,
    });
  }

  if (inputs.projectOverview?.trim()) {
    messages.push({
      role: 'user',
      content: `【赢标策略输入 v1｜项目概况】
${inputs.projectOverview.trim()}`,
    });
  }

  if (inputs.globalFacts?.trim()) {
    messages.push({
      role: 'user',
      content: `【赢标策略输入 v1｜我方优势素材（全局事实）】
以下是我方可在投标文件中引用的真实优势、业绩、资质、团队与承诺。证据必须来源于此，禁止编造未提供的业绩或资质。

${inputs.globalFacts.trim()}`,
    });
  } else {
    messages.push({
      role: 'user',
      content: `【赢标策略输入 v1｜我方优势素材】
当前未提供结构化的我方优势素材。请基于评分项设计"应当具备/应当补充"的优势方向，并在证据字段中提示需要用户补充哪些真实材料，不要编造具体业绩数字或资质编号。`,
    });
  }

  if (Array.isArray(inputs.outlineTitles) && inputs.outlineTitles.length) {
    messages.push({
      role: 'user',
      content: `【赢标策略输入 v1｜方案目录线索】
以下是已生成的技术方案目录标题，供判断赢标主题落在哪一章节，便于后续写作呼应。

${inputs.outlineTitles.map((title) => `- ${title}`).join('\n')}`,
    });
  }

  return messages;
}

function buildWinThemesMessages(inputs) {
  return [
    ...buildInputContextMessages(inputs),
    {
      role: 'user',
      content: `【赢标策略任务 v1｜第一轮：提炼赢标主题】
请基于以上评分项和我方优势素材，提炼 3-5 条"赢标主题（Win Theme）"，并输出 JSON。

赢标主题方法（Shipley/APMP）：每条主题遵循公式「特色 + 证据 = 对评委的价值」。
- title：主题标题，不超过 18 个字，正面、有记忆点。
- evidence：支撑该主题的真实证据（业绩、资质、团队、方法、承诺）。只能引用"我方优势素材"中可验证的内容；素材不足时写明需要补充的材料类型，不得编造具体数字或编号。
- differentiator：差异点，说明相对潜在竞争对手我方强在哪里（不要点名具体公司）。
- evaluatorBenefit：对评委/采购人的好处，紧扣评分标准或项目目标，回答"为什么该给分"。
- linkedRequirement：关联的评分项名称或招标要求，尽量与第一份输入中的评分项对应。
- priority：high / medium / low，按对总分的影响与可证明程度排序，最多 2 条 high。

要求：主题之间不要重复；优先覆盖权重高、主观打分空间大的评分项；使用简体中文。

JSON 格式：
{
  "themes": [
    {
      "title": "赢标主题标题",
      "evidence": "可验证的支撑证据或需补充的材料",
      "differentiator": "相对竞争对手的差异优势",
      "evaluatorBenefit": "对评委或采购人的价值，呼应评分标准",
      "linkedRequirement": "关联评分项或招标要求",
      "priority": "high"
    }
  ]
}

仅输出 JSON，不要输出 Markdown、代码块或解释。`,
    },
  ];
}

function buildScoreStrategyMessages(inputs, themes) {
  return [
    ...buildInputContextMessages(inputs),
    {
      role: 'user',
      content: `【赢标策略任务 v1｜第一轮赢标主题结果】
${JSON.stringify(themes, null, 2)}`,
    },
    {
      role: 'user',
      content: `【赢标策略任务 v1｜第二轮：得分策略】
请逐个评分项给出"如何多得分/拿满分"的得分策略，输出 JSON。

要求：
1. 优先覆盖权重高、可主观打分、容易拉开差距的评分项；客观资格分只需提示"务必满足、避免失分"。
2. ourStrength：我方在该项的真实强项或可建立的强项；素材不足时写明需要补充的材料，不要编造。
3. tactic：在投标文件中如何具体呈现（章节安排、数据图表、案例、承诺、量化指标等），让评委愿意给高分。
4. risk：该项的失分风险或评委可能的扣分点（没有明显风险可写"无明显风险"）。
5. weight 尽量引用评分项中的权重或分值；无法确定写"未明确"。
6. 控制在 5-10 条，聚焦真正能拉分的项目，使用简体中文。

JSON 格式：
{
  "scoreStrategy": [
    {
      "item": "评分项名称",
      "weight": "权重或分值",
      "ourStrength": "我方在该项的强项",
      "tactic": "在投标文件中多得分的具体打法",
      "risk": "失分风险或评委扣分点"
    }
  ]
}

仅输出 JSON，不要输出 Markdown、代码块或解释。`,
    },
  ];
}

function buildCompetitiveMessages(inputs, themes, scoreStrategy) {
  return [
    ...buildInputContextMessages(inputs),
    {
      role: 'user',
      content: `【赢标策略任务 v1｜前序结果】
赢标主题：
${JSON.stringify(themes, null, 2)}

得分策略：
${JSON.stringify(scoreStrategy, null, 2)}`,
    },
    {
      role: 'user',
      content: `【赢标策略任务 v1｜第三轮：竞争差异打法（影子竞争对手）】
请基于"影子竞争对手（Ghost Competitor）"方法，分析可能的竞争对手画像与我方差异打法，并输出 JSON。

方法要点：不点名任何真实公司，只描述典型竞争对手类型及其常见软肋，然后给出我方在投标文件中"正面凸显自身优势"的写法，借此让评委自然对比后倾向我方。严禁诋毁、贬低或编造对手的负面事实。

要求：
1. competitorPositioning：2-4 条，每条包含：
   - competitorType：假想竞争对手类型（如"低价抢标的小公司""缺乏本地服务的外地企业""仅有通用经验、缺少同类项目的公司"等）。
   - weakness：该类对手在本项目评分项下的典型软肋。
   - ourEdge：我方如何在投标文件中正面凸显对应优势（呼应评分项与赢标主题，不点名、不诋毁）。
2. overview：一段"竞争策略综述"，整体说明我方的赢标定位与打法主线（120-200 字）。
3. 使用简体中文。

JSON 格式：
{
  "competitorPositioning": [
    {
      "competitorType": "假想竞争对手类型",
      "weakness": "其在本项目评分项下的典型软肋",
      "ourEdge": "我方在投标文件中正面凸显的优势写法"
    }
  ],
  "overview": "竞争策略综述"
}

仅输出 JSON，不要输出 Markdown、代码块或解释。`,
    },
  ];
}

function normalizeThemes(parsed) {
  return getArrayPayload(parsed, ['themes', 'winThemes', 'items'])
    .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
    .map((item) => ({
      id: normalizeText(item.id) || createId('win_theme'),
      title: normalizeText(item.title || item.theme || item.name).slice(0, 60),
      evidence: normalizeText(item.evidence || item.proof || item.support),
      differentiator: normalizeText(item.differentiator || item.difference || item.edge),
      evaluatorBenefit: normalizeText(item.evaluatorBenefit || item.evaluator_benefit || item.benefit || item.value),
      linkedRequirement: normalizeText(item.linkedRequirement || item.linked_requirement || item.requirement || item.scoringItem),
      priority: normalizePriority(item.priority),
    }))
    .filter((item) => item.title);
}

function normalizeScoreStrategy(parsed) {
  return getArrayPayload(parsed, ['scoreStrategy', 'score_strategy', 'strategies', 'items'])
    .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
    .map((item) => ({
      id: normalizeText(item.id) || createId('win_score'),
      item: normalizeText(item.item || item.name || item.scoringItem || item.requirement).slice(0, 80),
      weight: normalizeText(item.weight || item.score || item.maxScore || item.points) || '未明确',
      ourStrength: normalizeText(item.ourStrength || item.our_strength || item.strength),
      tactic: normalizeText(item.tactic || item.approach || item.action || item.suggestion),
      risk: normalizeText(item.risk || item.riskReason || item.weakness) || '无明显风险',
    }))
    .filter((item) => item.item && item.tactic);
}

function normalizeCompetitorPositioning(parsed) {
  return getArrayPayload(parsed, ['competitorPositioning', 'competitor_positioning', 'competitors', 'items'])
    .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
    .map((item) => ({
      id: normalizeText(item.id) || createId('win_competitor'),
      competitorType: normalizeText(item.competitorType || item.competitor_type || item.type || item.profile).slice(0, 60),
      weakness: normalizeText(item.weakness || item.softSpot || item.gap),
      ourEdge: normalizeText(item.ourEdge || item.our_edge || item.edge || item.counter || item.response),
    }))
    .filter((item) => item.competitorType && item.ourEdge);
}

function createWinStrategyDeveloperLogger(aiService, meta = {}) {
  try {
    return aiService?.createDeveloperLogger?.('win-strategy', { name: 'win-strategy', meta }) || createNoopDeveloperLogger();
  } catch {
    return createNoopDeveloperLogger();
  }
}

async function runJson(aiService, request, label) {
  const jsonRequest = {
    ...request,
    response_format: request.response_format || { type: 'json_object' },
    logTitle: request.logTitle || label,
  };
  return aiService.collectJsonResponse ? aiService.collectJsonResponse(jsonRequest) : aiService.requestJson(jsonRequest);
}

function updateWinStrategyWorkspace(workspaceStore, updateTask, taskPartial, partial) {
  const task = updateTask(taskPartial);
  const winStrategy = workspaceStore.updateWinStrategy({ ...partial, task });
  updateTask(taskPartial, winStrategy);
  return winStrategy;
}

async function runWinStrategyTask({ aiService, workspaceStore, updateTask }) {
  if (typeof workspaceStore.loadStrategyInputs !== 'function' || typeof workspaceStore.createWinStrategyInputSignature !== 'function') {
    throw new Error('赢标策略存储接口尚未初始化');
  }
  const inputs = workspaceStore.loadStrategyInputs();
  if (!String(inputs.techRequirements || '').trim()) {
    throw new Error('缺少评分项内容，请先在“招标文件解析”中完成技术评分项解析。');
  }
  const inputSignature = String(workspaceStore.createWinStrategyInputSignature(inputs) || '');

  const developerLogger = createWinStrategyDeveloperLogger(aiService, { input_signature: inputSignature });
  developerLogger.write('win-strategy.started', {
    input_signature: inputSignature,
    tech_requirements_metrics: textMetrics(inputs.techRequirements),
    has_evaluation: Boolean(inputs.evaluationBid?.trim()),
    has_global_facts: Boolean(inputs.globalFacts?.trim()),
  });

  const logs = ['开始生成赢标策略。'];
  updateWinStrategyWorkspace(workspaceStore, updateTask, { status: 'running', progress: 5, logs }, {
    status: 'running',
    inputSignature,
    progressMessage: '第一轮：正在提炼赢标主题。',
    error: undefined,
    themes: [],
    scoreStrategy: [],
    competitorPositioning: [],
    overview: '',
  });

  try {
    // Round 1: Win themes
    const themesPayload = await runJson(aiService, {
      messages: buildWinThemesMessages(inputs),
      temperature: 0.4,
      schemaName: 'WinThemes',
      failureMessage: '赢标主题结果格式无效，请重试',
    }, '赢标主题');
    const themes = normalizeThemes(themesPayload);
    if (!themes.length) throw new Error('未能提炼出赢标主题，请检查评分项内容或稍后重试。');
    developerLogger.write('win-strategy.themes.completed', { count: themes.length });
    updateWinStrategyWorkspace(workspaceStore, updateTask, {
      status: 'running',
      progress: 40,
      logs: [...logs, `已提炼 ${themes.length} 条赢标主题。`],
    }, { themes, progressMessage: '第二轮：正在制定得分策略。' });

    // Round 2: Score strategy
    const scorePayload = await runJson(aiService, {
      messages: buildScoreStrategyMessages(inputs, themes),
      temperature: 0.2,
      schemaName: 'WinScoreStrategy',
      failureMessage: '得分策略结果格式无效，请重试',
    }, '得分策略');
    const scoreStrategy = normalizeScoreStrategy(scorePayload);
    developerLogger.write('win-strategy.score.completed', { count: scoreStrategy.length });
    updateWinStrategyWorkspace(workspaceStore, updateTask, {
      status: 'running',
      progress: 70,
      logs: [...logs, `已生成 ${scoreStrategy.length} 项得分策略。`],
    }, { scoreStrategy, progressMessage: '第三轮：正在分析竞争差异打法。' });

    // Round 3: Competitive differentiation
    const competitivePayload = await runJson(aiService, {
      messages: buildCompetitiveMessages(inputs, themes, scoreStrategy),
      temperature: 0.4,
      schemaName: 'WinCompetitive',
      failureMessage: '竞争差异结果格式无效，请重试',
    }, '竞争差异');
    const competitorPositioning = normalizeCompetitorPositioning(competitivePayload);
    const overview = normalizeText(
      (competitivePayload && !Array.isArray(competitivePayload) ? competitivePayload.overview || competitivePayload.summary : '') || '',
    );
    developerLogger.write('win-strategy.competitive.completed', {
      count: competitorPositioning.length,
      overview_metrics: textMetrics(overview),
    });

    updateWinStrategyWorkspace(workspaceStore, updateTask, {
      status: 'success',
      progress: 100,
      logs: [...logs, '赢标策略生成完成。'],
    }, {
      status: 'success',
      themes,
      scoreStrategy,
      competitorPositioning,
      overview,
      inputSignature,
      progressMessage: `已生成 ${themes.length} 条赢标主题、${scoreStrategy.length} 项得分策略`,
      error: undefined,
      generatedAt: now(),
    });
    developerLogger.write('win-strategy.completed', {
      themes: themes.length,
      score_strategy: scoreStrategy.length,
      competitor_positioning: competitorPositioning.length,
    });
  } catch (error) {
    const message = error?.message || '赢标策略生成失败';
    developerLogger.write('win-strategy.error', { error: compactLogError(error) });
    updateWinStrategyWorkspace(workspaceStore, updateTask, {
      status: 'error',
      progress: 100,
      logs: [...logs, `赢标策略生成失败：${message}`],
      error: message,
    }, {
      status: 'error',
      progressMessage: message,
      error: message,
    });
    throw error;
  }
}

module.exports = {
  runWinStrategyTask,
};
