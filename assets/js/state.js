/* ============================================================
 * state.js — 自研全局状态管理（无框架），挂载 window.DQState
 * 数据模型：主规范 spec §5 + 扩展规范 v2 §2（双业务活动 / Skill /
 * 规则-探针关联与执行统计）。内部实体仍叫 Agent/Task（仅代码标识符），
 * 用户层面一律展示「业务活动」「子业务活动」。
 * ============================================================ */
(function (global) {
  'use strict';

  var listeners = [];
  function emit(evt, payload) {
    listeners.forEach(function (fn) { try { fn(evt, payload); } catch (e) { console.error(e); } });
  }

  var State = {
    version: '2.0.0-proto',
    tenant: { id: 'T-DS41', name: 'DS4.1F 演示租户', status: 'PROVISIONED', provisioned_at: '2026-09-01' },
    /* 扩展 v3 §6：Demo A（探针生成）与 Demo B（规则生成）两条固定请求文本 */
    demoRequest: '帮我给订单表 order 的主键 order_id 生成一个非空校验探针，并每天凌晨调度运行。',
    demoRules: '根据主键质量规范 STD-002，为订单表 order_id 生成一条非空规则并发布生效。',

    /* ---------- 对话管理 · 会话种子（扩展 v3 §6） ---------- */
    conversations: [
      { id: 'CV-01', title: '订单主键非空探针生成', intent: 'RUN_PROBE_REQUEST', request: '帮我给订单表 order 的主键 order_id 生成一个非空校验探针，并每天凌晨调度运行。', status: '空闲', updated_at: '2026-10-11 09:30:12' },
      { id: 'CV-02', title: 'STD-002 主键非空规则发布', intent: 'RUN_RULE_REQUEST', request: '根据主键质量规范 STD-002，为订单表 order_id 生成一条非空规则并发布生效。', status: '空闲', updated_at: '2026-10-11 09:31:47' }
    ],

    /* ---------- 配置态资产 ---------- */
    /* 内置 Tool：主规范 §7.2 的 10 个 + 扩展 v2 §2.1 的 3 个（共 13 个） */
    builtinTools: [
      { id: 'tool-onto', name: 'ontology.lookup',   kind: 'KNOWLEDGE', category: 'BUILTIN',    desc: '本体查询：实体/属性/关系', schema: '{"input":{"entity":"string"},"output":{"entities":"[]","attributes":"[]","relationships":"[]"}}' },
      { id: 'tool-lin',  name: 'lineage.query',     kind: 'KNOWLEDGE', category: 'BUILTIN',    desc: '血缘查询：表/字段上下游',   schema: '{"input":{"table":"string","field":"string"},"output":{"upstream":"[]","downstream":"[]"}}' },
      { id: 'tool-kn',   name: 'knowledge.load',    kind: 'KNOWLEDGE', category: 'BUILTIN',    desc: '按白名单+权限加载知识（P2/P5）', schema: '{"input":{"knowledge_id":"string"},"output":{"snippet":"string","perm":"string"}}' },
      { id: 'tool-sql',  name: 'sql.execute',       kind: 'SQL',       category: 'BUILTIN',    desc: '向数据源提交 SQL 并返回结果', schema: '{"input":{"sql":"string","datasource_id":"string"},"output":{"rows":"[]"}}' },
      { id: 'tool-py',   name: 'python.run',        kind: 'PYTHON',    category: 'BUILTIN',    desc: '沙箱执行 Python 探针',        schema: '{"input":{"code":"string"},"output":{"result":"object"}}' },
      { id: 'tool-up',   name: 'probe.upsert',      kind: 'IO',        category: 'BUILTIN',    desc: '探针落库（业务产出物，P3）',  schema: '{"input":{"probe":"object"},"output":{"probe_id":"string"}}' },
      { id: 'tool-sch',  name: 'probe.schedule',    kind: 'IO',        category: 'BUILTIN',    desc: '注册调度计划',                schema: '{"input":{"probe_id":"string","cron":"string"},"output":{"schedule_id":"string"}}' },
      { id: 'tool-ds',   name: 'datasource.list',   kind: 'QUERY',     category: 'BUILTIN',    desc: '列出数据源',                  schema: '{"input":{},"output":{"datasources":"[]"}}' },
      { id: 'tool-std',  name: 'standard.list',     kind: 'QUERY',     category: 'BUILTIN',    desc: '列出数据质量标准',            schema: '{"input":{},"output":{"standards":"[]"}}' },
      { id: 'tool-rule', name: 'rule.list',         kind: 'QUERY',     category: 'BUILTIN',    desc: '列出数据质量规则',            schema: '{"input":{},"output":{"rules":"[]"}}' },
      /* —— 扩展 v2 §2.1 追加的 3 个内置 Tool —— */
      { id: 'tool-rup',  name: 'rule.upsert',       kind: 'IO',        category: 'BUILTIN',    desc: '规则落库（草稿）',            schema: '{"input":{"rule":"object"},"output":{"rule_id":"string"}}' },
      { id: 'tool-rpub', name: 'rule.publish',      kind: 'IO',        category: 'BUILTIN',    desc: '规则发布生效、回写版本',      schema: '{"input":{"rule_id":"string"},"output":{"version":"string"}}' },
      { id: 'tool-prun', name: 'probe.run',         kind: 'IO',        category: 'BUILTIN',    desc: '探针执行（调度触发/手动）',   schema: '{"input":{"probe_id":"string"},"output":{"status":"string","metrics":"object"}}' }
    ],
    registeredTools: [],   // 自定义注册产出（category: REGISTERED）

    /* ---------- Skill 目录（扩展 v2 §2.4，归属子业务活动） ---------- */
    skills: [
      { id: 'SK-01', subtask_id: 'SU-101', name: '本体探查包（探针生成）',   disclosure: 'L1', tools: ['ontology.lookup'], prompt: '使用本体服务定位目标实体、属性、主键与关系，输出实体-字段-关系三元组。' },
      { id: 'SK-02', subtask_id: 'SU-102', name: '规则检索包',               disclosure: 'L1', tools: ['rule.list', 'knowledge.load'], prompt: '依据目标字段检索规则库，返回关联规则、维度与判定口径。' },
      { id: 'SK-03', subtask_id: 'SU-103', name: '探针代码生成包',           disclosure: 'L2', tools: ['sql.execute', 'python.run'], prompt: '依规则口径生成 SQL 取数探针与 Python 比对探针，先试运行再输出最终代码。' },
      { id: 'SK-04', subtask_id: 'SU-104', name: '探针验证落库包',           disclosure: 'L2', tools: ['sql.execute', 'python.run', 'probe.upsert', 'probe.schedule'], prompt: '试运行验证探针，经 probe.upsert 落库、probe.schedule 注册调度。' },
      { id: 'SK-05', subtask_id: 'SU-201', name: '本体探查包（规则生成）',   disclosure: 'L1', tools: ['ontology.lookup'], prompt: '定位标准涉及实体与属性，输出字段口径。' },
      { id: 'SK-06', subtask_id: 'SU-202', name: '血缘探查包',               disclosure: 'L1', tools: ['lineage.query'], prompt: '分析字段上下游血缘与影响面，评估校验收益。' },
      { id: 'SK-07', subtask_id: 'SU-203', name: '标准解析包',               disclosure: 'L1', tools: ['standard.list', 'knowledge.load'], prompt: '解析数据质量标准的维度、范围与判定要求。' },
      { id: 'SK-08', subtask_id: 'SU-204', name: '规则生成包',               disclosure: 'L2', tools: ['rule.list', 'rule.upsert'], prompt: '结合标准+本体+血缘生成规则表达式与维度，落库为草稿。' },
      { id: 'SK-09', subtask_id: 'SU-205', name: '规则发布包',               disclosure: 'L1', tools: ['rule.publish'], prompt: '校验规则完整性后发布生效，回写版本号。' }
    ],

    /* ---------- 子业务活动（内部 Task；扩展 v2 §2.2 / §2.3 · v4 §1：Gate 全部人工确认 HUMAN） ---------- */
    subtasks: [
      { id: 'SU-101', ba_id: 'BA-01', name: '本体探查',     goal: '通过本体服务定位目标实体/属性/主键与实体关系', skill_ids: ['SK-01'], knowledge_ids: ['KN-01'], gate_policy: 'HUMAN',  order_index: 1 },
      { id: 'SU-102', ba_id: 'BA-01', name: '规则查找',     goal: '从规则库检索字段关联的数据质量规则与判定口径', skill_ids: ['SK-02'], knowledge_ids: ['KN-03'], gate_policy: 'HUMAN',  order_index: 2 },
      { id: 'SU-103', ba_id: 'BA-01', name: '探针生成',     goal: '依规则口径生成 SQL 取数探针与 Python 比对探针', skill_ids: ['SK-03'], knowledge_ids: ['KN-01', 'KN-03'], gate_policy: 'HUMAN', order_index: 3 },
      { id: 'SU-104', ba_id: 'BA-01', name: '探针验证落库', goal: '试运行验证探针并落库为业务资产、注册调度',     skill_ids: ['SK-04'], knowledge_ids: ['KN-03'], gate_policy: 'HUMAN', order_index: 4 },
      { id: 'SU-201', ba_id: 'BA-02', name: '本体探查',     goal: '定位标准涉及的目标实体与属性',                 skill_ids: ['SK-05'], knowledge_ids: ['KN-01'], gate_policy: 'HUMAN',  order_index: 1 },
      { id: 'SU-202', ba_id: 'BA-02', name: '血缘探查',     goal: '分析字段上下游血缘与影响面',                   skill_ids: ['SK-06'], knowledge_ids: ['KN-02'], gate_policy: 'HUMAN',  order_index: 2 },
      { id: 'SU-203', ba_id: 'BA-02', name: '标准探查',     goal: '解析数据质量标准的维度与适用范围',             skill_ids: ['SK-07'], knowledge_ids: ['KN-04', 'KN-03'], gate_policy: 'HUMAN', order_index: 3 },
      { id: 'SU-204', ba_id: 'BA-02', name: '规则生成',     goal: '结合标准+本体+血缘生成规则表达式并落库为草稿', skill_ids: ['SK-08'], knowledge_ids: ['KN-01', 'KN-02', 'KN-03', 'KN-04'], gate_policy: 'HUMAN', order_index: 4 },
      { id: 'SU-205', ba_id: 'BA-02', name: '规则发布',     goal: '校验规则完整性后发布生效',                     skill_ids: ['SK-09'], knowledge_ids: ['KN-04'], gate_policy: 'HUMAN', order_index: 5 }
    ],

    /* ---------- 业务活动（内部 Agent；扩展 v2 §2.2 / §2.3） ---------- */
    businessActivities: [
      { id: 'BA-01', name: '探针生成业务活动', status: 'PUBLISHED',
        description: '从自然语言需求出发，自动完成本体探查、规则查找、SQL/Python 探针生成与验证落库，并注册调度。',
        subtask_ids: ['SU-101', 'SU-102', 'SU-103', 'SU-104'],
        skill_ids: ['SK-01', 'SK-02', 'SK-03', 'SK-04'],
        tool_ids: ['ontology.lookup', 'rule.list', 'knowledge.load', 'sql.execute', 'python.run', 'probe.upsert', 'probe.schedule'],
        knowledge_ids: ['KN-01', 'KN-03'], created_by: '业务人员', created_at: '2026-09-20' },
      { id: 'BA-02', name: '规则生成业务活动', status: 'PUBLISHED',
        description: '从数据质量标准出发，结合本体与血缘探查，自动生成数据质量规则并发布生效。',
        subtask_ids: ['SU-201', 'SU-202', 'SU-203', 'SU-204', 'SU-205'],
        skill_ids: ['SK-05', 'SK-06', 'SK-07', 'SK-08', 'SK-09'],
        tool_ids: ['ontology.lookup', 'lineage.query', 'standard.list', 'knowledge.load', 'rule.list', 'rule.upsert', 'rule.publish'],
        knowledge_ids: ['KN-01', 'KN-02', 'KN-04', 'KN-03'], created_by: '数据质量管理员', created_at: '2026-09-25' }
    ],

    /* 兼容别名：S.agents / S.tasks → businessActivities / subtasks（既有引用不炸） */
    get agents() { return this.businessActivities; },
    get tasks() { return this.subtasks; },

    knowledge: [
      { id: 'KN-01', name: '本体 · 表/字段/关系', type: 'ONTOLOGY', scope: '租户级', permission_tag: '已授权', source: '本体服务（开租自动加载）' },
      { id: 'KN-02', name: '血缘 · 表级+字段级',   type: 'LINEAGE',  scope: '租户级', permission_tag: '已授权', source: '血缘系统（开租自动加载）' },
      { id: 'KN-03', name: '规则库 · 完整性/有效性', type: 'RULE',   scope: '业务活动级', permission_tag: '已授权', source: '标准管理系统' },
      { id: 'KN-04', name: '标准库 · DQ标准',       type: 'STANDARD', scope: '业务活动级', permission_tag: '已授权', source: '标准管理系统' },
      { id: 'KN-05', name: '文档 · ETL 任务说明',   type: 'DOC',      scope: '子业务活动级', permission_tag: '受限 · 仅摘要', source: '文档库' }
    ],

    /* ---------- 业务资产（主规范 §5 / 扩展 v2 §2.5-2.6） ---------- */
    standards: [
      { id: 'STD-001', name: '数据完整性标准', domain: '交易域', data_type: 'STRUCTURED', version: 'v2.3' },
      { id: 'STD-002', name: '主键质量规范',   domain: '交易域', data_type: 'STRUCTURED', version: 'v1.8' },
      { id: 'STD-003', name: '多模态元数据标准', domain: '内容域', data_type: 'MULTIMODAL', version: 'v1.2' },
      { id: 'STD-004', name: '客户信息一致性标准', domain: '客户域', data_type: 'STRUCTURED', version: 'v3.0' }
    ],

    /* 规则（含关联探针与执行统计，扩展 v2 §2.5；trend=最近 7 次 1 通过 / 0 失败） */
    rules: [
      { id: 'RULE-0101', standard_id: 'STD-002', name: '订单主键非空', dimension: '完整性', expression: 'order_id IS NOT NULL', status: '生效',
        probe_ids: ['PRB-0470', 'PRB-0471'], exec_count: 128, success_count: 127, success_rate: 99.2, last_run: '2026-10-10 00:00', trend: [1, 1, 0, 1, 1, 1, 1] },
      { id: 'RULE-0102', standard_id: 'STD-001', name: '订单金额非负', dimension: '有效性', expression: 'amount >= 0', status: '生效',
        probe_ids: ['PRB-0501'], exec_count: 256, success_count: 252, success_rate: 98.4, last_run: '2026-10-11 00:00', trend: [1, 1, 0, 1, 1, 1, 1] },
      { id: 'RULE-0103', standard_id: 'STD-004', name: '手机号格式有效', dimension: '有效性', expression: "mobile REGEXP '^1[3-9]\\d{9}$'", status: '生效',
        probe_ids: ['PRB-0475'], exec_count: 96, success_count: 92, success_rate: 95.8, last_run: '2026-10-10 08:00', trend: [1, 0, 1, 1, 0, 1, 1] },
      { id: 'RULE-0104', standard_id: 'STD-004', name: '客户ID唯一', dimension: '唯一性', expression: 'COUNT(DISTINCT cust_id) = COUNT(1)', status: '生效',
        probe_ids: ['PRB-0488'], exec_count: 64, success_count: 64, success_rate: 100, last_run: '2026-10-11 02:00', trend: [1, 1, 1, 1, 1, 1, 1] },
      { id: 'RULE-0105', standard_id: 'STD-003', name: '图片元数据齐全', dimension: '完整性', expression: 'meta.exif IS NOT NULL', status: '草稿',
        probe_ids: ['PRB-0502'], exec_count: 32, success_count: 28, success_rate: 87.5, last_run: '2026-10-09 00:00', trend: [1, 0, 1, 0, 1, 1, 0] },
      { id: 'RULE-0106', standard_id: 'STD-001', name: '订单同步及时性', dimension: '及时性', expression: 'sync_lag <= 5min', status: '生效',
        probe_ids: ['PRB-0490'], exec_count: 512, success_count: 497, success_rate: 97.1, last_run: '2026-10-11 07:30', trend: [1, 1, 1, 0, 1, 1, 1] }
    ],

    /* 探针（含执行统计，扩展 v2 §2.6） */
    probes: [
      { id: 'PRB-0470', rule_id: 'RULE-0101', name: '订单主键非空校验（SQL）', type: 'SQL', status: 'SCHEDULED', datasource_id: 'ds-01',
        code: '-- 完整性（非空校验）目标: ods_order_detail.order_id 规则: RULE-0101\nSELECT COUNT(1) AS total_rows,\n       SUM(CASE WHEN order_id IS NULL OR order_id = \'\' THEN 1 ELSE 0 END) AS null_rows\nFROM ods_order_detail;\n-- 判定: null_rows = 0 → PASS',
        exec_count: 128, success_rate: 99.2, last_run: '2026-10-10 00:00', cron: '0 0 * * *', cron_human: '每天 00:00', from_demo: false },
      { id: 'PRB-0471', rule_id: 'RULE-0101', name: '订单主键空值率（PYTHON）', type: 'PYTHON', status: 'RUNNABLE', datasource_id: 'ds-01',
        code: 'def probe(ctx):\n    df = ctx.sql("SELECT order_id FROM ods_order_detail")\n    total = len(df)\n    bad = int(df["order_id"].isna().sum() + (df["order_id"] == "").sum())\n    ratio = bad / total if total else 0.0\n    return {"status": "PASS" if ratio == 0.0 else "FAIL", "null_ratio": round(ratio, 6)}',
        exec_count: 0, success_rate: null, last_run: null, cron: null, cron_human: null, from_demo: false },
      { id: 'PRB-0501', rule_id: 'RULE-0102', name: '订单金额非负校验', type: 'SQL', status: 'RUNNABLE', datasource_id: 'ds-01',
        code: 'SELECT COUNT(1) FROM ods_order_detail WHERE amount < 0;',
        exec_count: 256, success_rate: 98.4, last_run: '2026-10-11 00:00', cron: null, cron_human: null, from_demo: false },
      { id: 'PRB-0475', rule_id: 'RULE-0103', name: '手机号格式校验', type: 'SQL', status: 'SCHEDULED', datasource_id: 'ds-03',
        code: "SELECT COUNT(1) FROM dim_customer WHERE mobile NOT REGEXP '^1[3-9][0-9]{9}$';",
        exec_count: 96, success_rate: 95.8, last_run: '2026-10-10 08:00', cron: '0 8 * * *', cron_human: '每天 08:00', from_demo: false },
      { id: 'PRB-0488', rule_id: 'RULE-0104', name: '客户ID唯一性校验', type: 'SQL', status: 'SCHEDULED', datasource_id: 'ds-03',
        code: 'SELECT COUNT(1) - COUNT(DISTINCT cust_id) FROM dim_customer;',
        exec_count: 64, success_rate: 100, last_run: '2026-10-11 02:00', cron: '0 2 * * *', cron_human: '每天 02:00', from_demo: false },
      { id: 'PRB-0502', rule_id: 'RULE-0105', name: '图片元数据完整性', type: 'PYTHON', status: 'DRAFT', datasource_id: 'ds-03',
        code: '# TODO: 由规则生成业务活动补全 EXIF 元数据校验逻辑',
        exec_count: 0, success_rate: null, last_run: null, cron: null, cron_human: null, from_demo: false },
      { id: 'PRB-0490', rule_id: 'RULE-0106', name: '订单同步及时性', type: 'SQL', status: 'SCHEDULED', datasource_id: 'ds-02',
        code: 'SELECT MAX(sync_lag_min) FROM ods_order_detail;',
        exec_count: 512, success_rate: 97.1, last_run: '2026-10-11 07:30', cron: '*/30 * * * *', cron_human: '每 30 分钟', from_demo: false }
    ],
    datasources: [
      { id: 'ds-01', name: '订单主库', db_type: 'MySQL 8.0' },
      { id: 'ds-02', name: '数据中台Doris', db_type: 'Doris 2.1' },
      { id: 'ds-03', name: '客户中心PG', db_type: 'PostgreSQL 16' }
    ],

    /* ---------- 运行态 ---------- */
    runs: [],           // 每次 demo run 摘要
    traces: [],         // 链路追踪条目 {seq,node,call_type,latency_ms,prompt_tokens,completion_tokens,status,detail}
    runSeq: 0,
    activeRunId: null,
    pendingDemo: false, // dashboard/向导点击后跳转 #/chat 自动开播：true/'A'=探针生成 · 'B'=规则生成
    assetChain: { tool: false, skill: false, task: false, agent: false },
    kpi: { probeSuccessRate: 92.4 },

    /* ---------- API ---------- */
    on: function (fn) { listeners.push(fn); },
    allTools: function () { return this.builtinTools.concat(this.registeredTools); },
    countRegisteredTool: function (t) {
      this.registeredTools.push(t);
      this.assetChain.tool = true;
      emit('tools:changed', t);
    },
    countSkill: function (s) {
      this.skills.push(s);
      this.assetChain.skill = true;
      emit('skills:changed', s);
    },
    countTask: function (t) {
      this.subtasks.push(t);
      this.assetChain.task = true;
      emit('tasks:changed', t);
    },
    publishAgent: function (a) {
      a.status = 'PUBLISHED';
      this.businessActivities.push(a);
      this.assetChain.agent = true;
      emit('agents:changed', a);
    },
    addProbe: function (p) {
      this.probes.unshift(p);
      /* 联动规则关联探针（扩展 v2 §2.5：动态合并，UI 立即生效） */
      var rule = this.rules.filter(function (r) { return r.id === p.rule_id; })[0];
      if (rule && rule.probe_ids.indexOf(p.id) < 0) rule.probe_ids.push(p.id);
      emit('probes:changed', p);
      emit('rules:changed', rule || null);
    },
    /* 规则写入（扩展 v3 §6）：新规则 unshift；同 id 已存在则合并字段（草稿→生效发布复用）；均 emit rules:changed */
    addRule: function (rule) {
      var exist = this.rules.filter(function (r) { return r.id === rule.id; })[0];
      if (exist) {
        Object.keys(rule).forEach(function (k) { exist[k] = rule[k]; });
        emit('rules:changed', exist);
        return exist;
      }
      this.rules.unshift(rule);
      emit('rules:changed', rule);
      return rule;
    },
    /* —— 关联计算（管理视图统一入口） —— */
    getRule: function (ruleId) {
      return State.rules.filter(function (r) { return r.id === ruleId; })[0] || null;
    },
    getProbe: function (probeId) {
      return State.probes.filter(function (p) { return p.id === probeId; })[0] || null;
    },
    /* 规则关联探针 = probes 中 rule_id 匹配 ∪ rule.probe_ids（去重，按 id 稳定排序） */
    associatedProbes: function (ruleId) {
      var rule = State.getRule(ruleId);
      var byId = {};
      State.probes.forEach(function (p) {
        if (p.rule_id === ruleId) byId[p.id] = p;
      });
      if (rule) rule.probe_ids.forEach(function (pid) {
        var p = State.getProbe(pid);
        if (p) byId[p.id] = p;
      });
      return Object.keys(byId).sort().map(function (k) { return byId[k]; });
    },
    getSubtask: function (subId) {
      return State.subtasks.filter(function (t) { return t.id === subId; })[0] || null;
    },
    getActivity: function (baId) {
      return State.businessActivities.filter(function (b) { return b.id === baId; })[0] || null;
    },
    /* 业务活动 → 子活动 id 列表（兼容向导产物 task_ids 与子活动 ba_id 反向引用） */
    activitySubtaskIds: function (ba) {
      if (ba.subtask_ids || ba.task_ids) {
        var ids = ba.subtask_ids || ba.task_ids || [];
        return ids.filter(function (id) { return !!State.getSubtask(id); });
      }
      return State.subtasks.filter(function (t) { return t.ba_id === ba.id; }).map(function (t) { return t.id; });
    },
    activitySkillIds: function (ba) {
      var set = {};
      (ba.skill_ids || []).forEach(function (id) { set[id] = true; });
      if (!Object.keys(set).length) {
        State.activitySubtaskIds(ba).forEach(function (sid) {
          var st = State.getSubtask(sid);
          if (st) (st.skill_ids || []).forEach(function (id) { set[id] = true; });
        });
      }
      return Object.keys(set);
    },
    activityToolIds: function (ba) {
      var set = {};
      (ba.tool_ids || []).forEach(function (name) { set[name] = true; });
      if (!Object.keys(set).length) {
        State.activitySkillIds(ba).forEach(function (kid) {
          var k = State.skills.filter(function (x) { return x.id === kid; })[0];
          if (k) (k.tools || []).forEach(function (name) { set[name] = true; });
        });
      }
      return Object.keys(set);
    },
    /* Tool 被引用次数 = 引用该 Tool 的 Skill 数（扩展 v2 §2.1，前端计算） */
    toolRefCount: function (toolName) {
      return State.skills.filter(function (k) { return (k.tools || []).indexOf(toolName) >= 0; }).length;
    },

    /* Trace 收集：runtime 每个 LLM/TOOL 调用打点 */
    trace: function (entry) {
      State.runSeq += 1;
      entry.seq = State.runSeq;
      entry.run_id = State.activeRunId;
      entry.t = new Date().toLocaleTimeString('zh-CN', { hour12: false });
      State.traces.push(entry);
      emit('trace:added', entry);
      return entry;
    },
    startRun: function (requestText) {
      var run = { id: 'RUN-' + String(Date.now()).slice(-6), request: requestText, started_at: new Date().toLocaleTimeString('zh-CN', { hour12: false }), status: 'RUNNING' };
      State.runs.unshift(run);
      State.activeRunId = run.id;
      emit('run:started', run);
      return run;
    },
    finishRun: function (status) {
      var run = State.runs[0];
      if (run) { run.status = status || 'SUCCESS'; }
      emit('run:finished', run);
    },
    resetTraces: function () {
      State.traces = [];
      State.runSeq = 0;
      emit('traces:reset', null);
    }
  };

  global.DQState = State;
  console.log('%c[DQ-Prototype] state.js 已加载：双业务活动 + Skill/Tool/规则/探针种子数据（扩展 v2 §2）', 'color:#4f7cff;font-weight:bold;');
})(window);
