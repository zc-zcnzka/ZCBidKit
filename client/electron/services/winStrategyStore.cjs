const crypto = require('node:crypto');

const RUN_STATUS = ['idle', 'running', 'success', 'error'];

function now() {
  return new Date().toISOString();
}

function createId(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

function hasOwn(value, field) {
  return Object.prototype.hasOwnProperty.call(value || {}, field);
}

function normalizeStatus(value, fallback = 'idle') {
  return RUN_STATUS.includes(value) ? value : fallback;
}

function normalizePriority(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'high' || raw.includes('高')) return 'high';
  if (raw === 'low' || raw.includes('低')) return 'low';
  return 'medium';
}

function safeJsonParse(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function jsonOrNull(value) {
  return value === undefined || value === null ? null : JSON.stringify(value);
}

function collectOutlineTitles(outlineData, limit = 40) {
  const titles = [];
  const walk = (nodes, depth) => {
    if (!Array.isArray(nodes) || depth > 1) return;
    for (const node of nodes) {
      if (titles.length >= limit) return;
      const title = String(node?.title || '').trim();
      if (title) titles.push(title);
      if (Array.isArray(node?.children) && node.children.length) walk(node.children, depth + 1);
    }
  };
  walk(outlineData?.outline || [], 0);
  return titles;
}

function stringifyGlobalFacts(globalFacts) {
  if (!Array.isArray(globalFacts)) return '';
  return globalFacts
    .map((group) => {
      const title = String(group?.title || '').trim();
      const content = String(group?.content || '').trim();
      if (!title && !content) return '';
      return title ? `【${title}】\n${content}` : content;
    })
    .filter(Boolean)
    .join('\n\n');
}

const initialState = {
  status: 'idle',
  overview: '',
  themes: [],
  scoreStrategy: [],
  competitorPositioning: [],
  inputSignature: undefined,
  progressMessage: undefined,
  error: undefined,
  generatedAt: undefined,
  updatedAt: undefined,
  task: undefined,
};

function createWinStrategyStore({ db, technicalPlanStore }) {
  function ensureRow() {
    const existing = db.prepare('SELECT * FROM technical_plan_win_strategy WHERE id = 1').get();
    if (existing) return existing;
    const timestamp = now();
    db.prepare(`
      INSERT INTO technical_plan_win_strategy (id, status, theme_count, updated_at)
      VALUES (1, 'idle', 0, @timestamp)
    `).run({ timestamp });
    return db.prepare('SELECT * FROM technical_plan_win_strategy WHERE id = 1').get();
  }

  function loadThemes() {
    return db.prepare('SELECT * FROM technical_plan_win_themes ORDER BY sort_order ASC').all().map((row) => ({
      id: row.theme_id,
      title: row.title,
      evidence: row.evidence || '',
      differentiator: row.differentiator || '',
      evaluatorBenefit: row.evaluator_benefit || '',
      linkedRequirement: row.linked_requirement || '',
      priority: normalizePriority(row.priority),
    }));
  }

  function saveThemeRows(themes) {
    db.prepare('DELETE FROM technical_plan_win_themes').run();
    const timestamp = now();
    const insert = db.prepare(`
      INSERT INTO technical_plan_win_themes (
        theme_id, title, evidence, differentiator, evaluator_benefit, linked_requirement, priority, sort_order, created_at, updated_at
      ) VALUES (
        @theme_id, @title, @evidence, @differentiator, @evaluator_benefit, @linked_requirement, @priority, @sort_order, @created_at, @updated_at
      )
    `);
    (Array.isArray(themes) ? themes : []).forEach((item, index) => insert.run({
      theme_id: String(item.id || createId('win_theme')),
      title: String(item.title || ''),
      evidence: String(item.evidence || ''),
      differentiator: String(item.differentiator || ''),
      evaluator_benefit: String(item.evaluatorBenefit || ''),
      linked_requirement: String(item.linkedRequirement || ''),
      priority: normalizePriority(item.priority),
      sort_order: index,
      created_at: timestamp,
      updated_at: timestamp,
    }));
  }

  function loadWinStrategy() {
    const row = ensureRow();
    return {
      ...initialState,
      status: normalizeStatus(row.status),
      overview: row.overview || '',
      themes: loadThemes(),
      scoreStrategy: safeJsonParse(row.score_strategy_json, []),
      competitorPositioning: safeJsonParse(row.competitor_positioning_json, []),
      inputSignature: row.input_signature || undefined,
      progressMessage: row.progress_message || undefined,
      error: row.error || undefined,
      generatedAt: row.generated_at || undefined,
      updatedAt: row.updated_at || undefined,
      task: safeJsonParse(row.task_json, undefined),
    };
  }

  const updateTransaction = db.transaction((partial) => {
    ensureRow();
    const fields = {};
    if (hasOwn(partial, 'status')) fields.status = normalizeStatus(partial.status);
    if (hasOwn(partial, 'overview')) fields.overview = String(partial.overview || '');
    if (hasOwn(partial, 'scoreStrategy')) fields.score_strategy_json = jsonOrNull(partial.scoreStrategy);
    if (hasOwn(partial, 'competitorPositioning')) fields.competitor_positioning_json = jsonOrNull(partial.competitorPositioning);
    if (hasOwn(partial, 'inputSignature')) fields.input_signature = partial.inputSignature ? String(partial.inputSignature) : null;
    if (hasOwn(partial, 'progressMessage')) fields.progress_message = partial.progressMessage ? String(partial.progressMessage) : null;
    if (hasOwn(partial, 'error')) fields.error = partial.error ? String(partial.error) : null;
    if (hasOwn(partial, 'generatedAt')) fields.generated_at = partial.generatedAt ? String(partial.generatedAt) : null;
    if (hasOwn(partial, 'task')) fields.task_json = jsonOrNull(partial.task);
    if (hasOwn(partial, 'themes')) {
      saveThemeRows(partial.themes);
      fields.theme_count = Array.isArray(partial.themes) ? partial.themes.length : 0;
    }
    const entries = Object.entries(fields);
    const assignments = entries.map(([key]) => `${key} = @${key}`).join(', ');
    db.prepare(`
      UPDATE technical_plan_win_strategy
      SET ${assignments ? `${assignments}, ` : ''}updated_at = @updated_at
      WHERE id = 1
    `).run({
      ...Object.fromEntries(entries),
      updated_at: now(),
    });
  });

  function updateWinStrategy(partial) {
    updateTransaction(partial || {});
    return loadWinStrategy();
  }

  function saveWinStrategy(state) {
    return updateWinStrategy(state || {});
  }

  function clearWinStrategy() {
    const transaction = db.transaction(() => {
      db.prepare('DELETE FROM technical_plan_win_themes').run();
      db.prepare('DELETE FROM technical_plan_win_strategy').run();
      ensureRow();
    });
    transaction();
    return { success: true, message: '赢标策略缓存已清空', state: loadWinStrategy() };
  }

  function loadStrategyInputs() {
    const plan = technicalPlanStore?.loadTechnicalPlan ? technicalPlanStore.loadTechnicalPlan() : {};
    const techRequirements = String(plan.techRequirements || '');
    const projectOverview = String(plan.projectOverview || '');
    const evaluationTask = plan.bidAnalysisTasks?.evaluationBid;
    const evaluationBid = evaluationTask?.status === 'success' ? String(evaluationTask.content || '') : '';
    const globalFacts = stringifyGlobalFacts(plan.globalFacts);
    const outlineTitles = collectOutlineTitles(plan.outlineData);
    const projectName = String(plan.outlineData?.project_name || plan.tenderFile?.fileName || '').trim();
    return { techRequirements, projectOverview, evaluationBid, globalFacts, outlineTitles, projectName };
  }

  function createWinStrategyInputSignature(inputs = {}) {
    const tech = String(inputs.techRequirements || '').trim();
    if (!tech) return '';
    const evaluation = String(inputs.evaluationBid || '').trim();
    const overview = String(inputs.projectOverview || '').trim();
    const facts = String(inputs.globalFacts || '').trim();
    return [
      tech.length, tech.slice(0, 800), tech.slice(-800),
      evaluation.length, evaluation.slice(0, 400),
      overview.length, overview.slice(0, 400),
      facts.length, facts.slice(0, 400),
    ].join('\n---yibiao-win-strategy-input---\n');
  }

  ensureRow();

  return {
    loadWinStrategy,
    saveWinStrategy,
    updateWinStrategy,
    clearWinStrategy,
    loadStrategyInputs,
    createWinStrategyInputSignature,
  };
}

module.exports = {
  createWinStrategyStore,
};
