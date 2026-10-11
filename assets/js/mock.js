/* ============================================================
 * mock.js — MOCK 外部系统（本体/血缘/规则库/标准库/LLM/数据源/探针执行器/调度/规则写操作）
 * 全部为前端模拟实现：async + 300~900ms 随机延迟 + console 日志横幅。
 * 挂载到全局 window.DQMock。禁止任何网络请求。
 * ============================================================ */
(function (global) {
  'use strict';

  var SEQ = 0;
  function rid(prefix) {
    SEQ += 1;
    return (prefix || 'mock') + '-' + String(SEQ).padStart(3, '0');
  }
  function rand(min, max) { return Math.floor(min + Math.random() * (max - min)); }
  function sleep(ms) {
    return new Promise(function (res) { setTimeout(res, ms); });
  }
  function banner(sys, api, payload) {
    var style = 'background:#1d294e;color:#2dd4bf;padding:2px 8px;border-radius:6px;font-weight:bold;';
    console.log('%c[MOCK·' + sys + ']%c ' + api, style, 'color:#9fb0d9;', payload || '');
  }
  function delayed(sys, api, factory, min, max) {
    var ms = rand(min || 300, max || 900);
    banner(sys, api + '  (模拟延迟 ' + ms + 'ms)');
    return sleep(ms).then(function () {
      var out = typeof factory === 'function' ? factory() : factory;
      banner(sys, api + '  → 返回', out);
      return { data: out, latency_ms: ms };
    });
  }

  /* ---------------------------------------------------------
   * MockLLM — 结构化输出 + 打字机流式输出
   * --------------------------------------------------------- */
  var MockLLM = {
    model: 'mock-qwen-max',

    /* 通用流式打字机：把 text 逐字写入 el（含光标闪烁），完成后 resolve */
    streamText: function (el, text, speed) {
      speed = speed || 18;
      return new Promise(function (resolve) {
        if (!el) { sleep(text.length * speed).then(resolve); return; }
        var i = 0;
        el.textContent = '';
        el.classList.add('typing');
        (function tick() {
          if (i <= text.length) {
            el.textContent = text.slice(0, i);
            i += rand(1, 3);
            setTimeout(tick, speed);
          } else {
            el.classList.remove('typing');
            el.textContent = text;
            resolve();
          }
        })();
      });
    },

    /* Stage1 状态检测 */
    detectState: function (ctx) {
      return delayed('LLM', 'router.stage1 状态检测', function () {
        return {
          model: MockLLM.model,
          result: {
            session_state: '运行态 · 会话空闲',
            hitl_pending: false,
            can_continue: true,
            label: 'RUNTIME_IDLE / 可继续（无 HITL 挂起）',
            reasoning: '检测到当前租户已完成开租与业务活动发布（探针生成 / 规则生成业务活动），会话无挂起中断点，可直接进入对话运行主链路。'
          },
          prompt_tokens: rand(320, 520),
          completion_tokens: rand(60, 140),
          latency_ms: rand(300, 900)
        };
      });
    },

    /* Stage2 意图分类 — 枚举固定（扩展 v3 §3：含 RUN_RULE_REQUEST；按关键词分支） */
    classifyIntent: function (message) {
      message = String(message || '');
      return delayed('LLM', 'router.stage2 意图分类', function () {
        var ENUM = ['CONFIG_TOOL', 'CONFIG_SKILL', 'CONFIG_TASK', 'CONFIG_AGENT',
                    'RUN_PROBE_REQUEST', 'RUN_RULE_REQUEST', 'QUERY_RESULT', 'FOLLOW_UP', 'HITL_RESUME'];
        var isProbe = /探针|校验|落库|调度/.test(message);
        var isRule = /规则|标准|发布/.test(message);
        var res;
        if (isProbe) {
          res = {
            intent: 'RUN_PROBE_REQUEST',
            confidence: 0.97,
            signals: [
              { kw: 'order / order_id', to: '本体定位（实体·属性·主键）' },
              { kw: '非空校验', to: '规则维度 = 完整性' },
              { kw: '每天凌晨调度', to: '调度诉求 → probe.schedule' }
            ],
            reasoning: '命中「探针 / 校验 / 落库 / 调度」关键词：用户要求“生成非空校验探针并每天凌晨调度”，属于运行态发起探测。'
          };
        } else if (isRule) {
          res = {
            intent: 'RUN_RULE_REQUEST',
            confidence: 0.96,
            signals: [
              { kw: 'STD-002 / 规范', to: '标准库解析 → knowledge.load(KN-04)' },
              { kw: '生成非空规则', to: '规则维度 = 完整性 → rule.upsert' },
              { kw: '发布生效', to: '发布诉求 → rule.publish（HITL 确认）' }
            ],
            reasoning: '命中「规则 / 标准 / 发布」关键词：用户要求“按标准 STD-002 生成非空规则并发布生效”，属于运行态发起规则生成。'
          };
        } else {
          res = {
            intent: 'FOLLOW_UP',
            confidence: 0.62,
            signals: [
              { kw: '未命中「探针/校验/落库/调度」或「规则/标准/发布」', to: '兜底：人工追问澄清' }
            ],
            reasoning: '未识别出运行态业务意图，不路由业务活动；建议追问澄清诉求。'
          };
        }
        res.enum = ENUM;
        return {
          model: MockLLM.model,
          result: res,
          prompt_tokens: rand(640, 900),
          completion_tokens: rand(120, 220),
          latency_ms: rand(300, 900)
        };
      }, 500, 1100);
    },

    /* Stage3 动作路由 — 意图 → 业务活动（扩展 v3 §3：BA-01 / BA-02 映射） */
    routeAction: function (intent) {
      intent = intent || 'RUN_PROBE_REQUEST';
      return delayed('LLM', 'router.stage3 动作执行', function () {
        var map = {
          RUN_PROBE_REQUEST: {
            business_activity: '探针生成业务活动', ba_id: 'BA-01', target_graph: 'DQProbeGenerationDAG',
            entry_nodes: ['knowledge_load', 'plan_subtasks', 'execute_subtask', 'gate_subtask', 'finish_check'],
            reasoning: '路由至「探针生成业务活动」子图（BA-01 · 4 个子业务活动），入口节点 knowledge_load（Planner 按子业务活动白名单加载知识）。'
          },
          RUN_RULE_REQUEST: {
            business_activity: '规则生成业务活动', ba_id: 'BA-02', target_graph: 'DQRuleGenerationDAG',
            entry_nodes: ['knowledge_load', 'plan_subtasks', 'execute_subtask', 'gate_subtask', 'finish_check'],
            reasoning: '路由至「规则生成业务活动」子图（BA-02 · 5 个子业务活动），入口节点 knowledge_load（本体/血缘/标准库/规则库白名单加载）。'
          },
          FOLLOW_UP: {
            business_activity: null, ba_id: null, target_graph: null, entry_nodes: [],
            reasoning: '意图未命中运行态业务活动，不路由；由对话兜底追问澄清。'
          }
        };
        var hit = map[intent] || map.FOLLOW_UP;
        return {
          model: MockLLM.model,
          result: {
            intent: intent,
            business_activity: hit.business_activity,
            ba_id: hit.ba_id,
            target_graph: hit.target_graph,
            entry_nodes: hit.entry_nodes,
            reasoning: hit.reasoning
          },
          prompt_tokens: rand(420, 640),
          completion_tokens: rand(80, 160),
          latency_ms: rand(300, 900)
        };
      });
    },

    /* Planner：选择需要加载的知识（白名单内，按命中的业务活动分支 · 扩展 v3 §4） */
    selectKnowledge: function (intent) {
      return delayed('LLM', 'planner 知识挑选（P5：规划期加载）', function () {
        var isRule = intent === 'RUN_RULE_REQUEST';
        return {
          model: MockLLM.model,
          result: {
            selected: isRule ? ['KN-01', 'KN-02', 'KN-04', 'KN-03'] : ['KN-01', 'KN-03'],
            reason: isRule
              ? '规则生成需 本体（order/order_id 口径）+ 血缘（影响面评估）+ 标准库（STD-002 主键质量规范）+ 规则库（查重与判定口径复用）。文档与本次目标无关，不加载（节省上下文）。'
              : '本体探查需 本体（实体/主键/关系）；规则查找与探针口径需 规则库（RULE-0101 判定口径）。血缘/标准/文档与本次目标无关，不加载（节省上下文）。'
          },
          prompt_tokens: rand(900, 1400),
          completion_tokens: rand(60, 120),
          latency_ms: rand(300, 900)
        };
      });
    },

    /* Planner：产出子活动 DAG（扩展 v2 §6 + v3 §4 Demo A：探针生成 4 子活动） */
    plan: function (request) {
      return delayed('LLM', 'plan_subtasks 规划子活动', function () {
        return {
          model: MockLLM.model,
          result: {
            dag_id: rid('dag'),
            business_activity: 'BA-01 · 探针生成业务活动',
            ba_id: 'BA-01',
            gate_node: 'ST-4',
            gate_all: true,
            subtasks: [
              { id: 'ST-1', name: '本体探查',     goal: '本体服务定位 order/order_id（主键）与实体关系', tool_chain: ['ontology.lookup'], scene: 'locate', gate: 'HUMAN' },
              { id: 'ST-2', name: '规则查找',     goal: '规则库检索字段关联规则（RULE-0101）与判定口径', tool_chain: ['rule.list'], scene: 'rule', gate: 'HUMAN' },
              { id: 'ST-3', name: '探针生成',     goal: '依规则口径生成 SQL 取数 + Python 比对探针并试跑', tool_chain: ['sql.execute', 'python.run'], scene: 'gen', gate: 'HUMAN' },
              { id: 'ST-4', name: '探针验证落库', goal: 'probe.upsert 落库 + probe.schedule 注册调度（Gate 人工确认）', tool_chain: ['probe.upsert', 'probe.schedule'], scene: 'persist', gate: 'HUMAN' }
            ],
            edges: [['ST-1', 'ST-2'], ['ST-2', 'ST-3'], ['ST-3', 'ST-4']],
            parallel_candidates: ['ST-2', 'ST-3'],
            dag_note: '线性 ST-1→ST-2→ST-3→ST-4（ST-2/ST-3 为并行候选）· 每个子活动 Gate=人工确认（HITL）'
          },
          prompt_tokens: rand(1600, 2400),
          completion_tokens: rand(260, 420),
          latency_ms: rand(600, 1200)
        };
      }, 700, 1300);
    },

    /* Planner：规则生成 5 子活动 DAG（扩展 v3 §4 Demo B） */
    planRule: function (request) {
      return delayed('LLM', 'plan_subtasks 规划子活动（规则生成）', function () {
        return {
          model: MockLLM.model,
          result: {
            dag_id: rid('dag'),
            business_activity: 'BA-02 · 规则生成业务活动',
            ba_id: 'BA-02',
            gate_node: 'ST-5',
            gate_all: true,
            subtasks: [
              { id: 'ST-1', name: '本体探查', goal: '定位标准涉及实体：order 实体与 order_id 主键属性', tool_chain: ['ontology.lookup'], scene: 'locate', gate: 'HUMAN' },
              { id: 'ST-2', name: '血缘探查', goal: '分析 order_id 上下游血缘与影响面，评估校验收益', tool_chain: ['lineage.query'], scene: 'lineage', gate: 'HUMAN' },
              { id: 'ST-3', name: '标准探查', goal: '解析 STD-002 主键质量规范的维度与判定要求', tool_chain: ['standard.list', 'knowledge.load'], scene: 'standard', gate: 'HUMAN' },
              { id: 'ST-4', name: '规则生成', goal: '结合标准+本体+血缘生成非空规则表达式，rule.upsert 落库为草稿', tool_chain: ['rule.upsert'], scene: 'genRule', gate: 'HUMAN' },
              { id: 'ST-5', name: '规则发布', goal: 'rule.publish 发布生效，回写标准关联与版本（Gate 人工确认）', tool_chain: ['rule.publish'], scene: 'publish', gate: 'HUMAN' }
            ],
            edges: [['ST-1', 'ST-2'], ['ST-2', 'ST-3'], ['ST-3', 'ST-4'], ['ST-4', 'ST-5']],
            parallel_candidates: ['ST-2', 'ST-3'],
            dag_note: '线性 ST-1→ST-2→ST-3→ST-4→ST-5（ST-2/ST-3 为并行候选）· 每个子活动 Gate=人工确认（HITL）'
          },
          prompt_tokens: rand(1800, 2600),
          completion_tokens: rand(300, 480),
          latency_ms: rand(700, 1300)
        };
      }, 700, 1300);
    },

    /* 规则生成：LLM 产出规则结构化草案（扩展 v3 §5） */
    genRule: function () {
      return delayed('LLM', 'llm.generate(rule)', function () {
        return {
          model: MockLLM.model,
          result: {
            rule_id: 'RULE-0107',
            name: '订单主键非空',
            dimension: '完整性',
            standard_id: 'STD-002',
            expression: 'order_id IS NOT NULL',
            judge: 'null_rows=0 → PASS',
            field: 'ods_order_detail.order_id'
          },
          prompt_tokens: rand(2000, 3000),
          completion_tokens: rand(160, 280),
          latency_ms: rand(500, 1000)
        };
      }, 600, 1100);
    },

    /* Executor：ReAct 的 Thought 文本（保留 locate/rule/gen/persist · 新增 lineage/standard/genRule/publish · 扩展 v3 §5） */
    thought: function (scene, vars) {
      var bank = {
        'locate': '先调用 ontology.lookup 定位 order 实体与 order_id 属性（PK 标记 · NOT NULL），确认实体关系 order 1:N order_item，为规则查找提供准确的字段口径。',
        'rule': '从规则库检索与 order.order_id 关联的数据质量规则：预期命中 RULE-0101（订单主键非空 · 完整性），判定口径 null_rows = 0 → PASS，作为探针生成依据。',
        'gen': '依据 RULE-0101 口径：先 llm.generate 生成 SQL 取数探针（COUNT + SUM(CASE WHEN)）并 sql.execute 试跑；再生成 Python 空值率比对探针并 python.run 试跑，双探针验证通过后进入落库。',
        'persist': '两份探针试跑均 PASS。按 P2 落库必须经 probe.upsert 原子写入产物探针资产，并经 probe.schedule 注册每天 00:00 调度；执行产出在本子活动 Gate 处由人工确认（HITL · Gate 策略 HUMAN）。',
        'sched': '用户要求“每天凌晨调度”。生成 cron `0 0 * * *` 调度计划，通过 probe.schedule 注册到调度服务。',
        'lineage': '规则要覆盖真实影响面：调用 lineage.query 分析 order.order_id 的上下游血缘——上游清洗映射、下游聚合/宽表 JOIN 键，确认空值危害与校验收益，为规则必要性提供证据。',
        'standard': '用户引用了标准 STD-002：先 standard.list 拉取标准清单定位「主键质量规范」，再 knowledge.load(KN-04) 读取标准摘要——主键必须配置非空+唯一探针，规则维度取「完整性」。',
        'genRule': '综合本体（order_id PK · NOT NULL）、血缘（下游 JOIN 键）与标准 STD-002：生成规则 RULE-0107「订单主键非空」，表达式 order_id IS NOT NULL，判定口径 null_rows=0 → PASS；先经 rule.upsert 落库为草稿（P2 写操作）。',
        'publish': '草稿 RULE-0107 已通过完整性自检（表达式/维度/标准关联齐备）。发布为「生效」是写操作且对下游可见，必须经 rule.publish 执行，执行产出在本子活动 Gate 处由人工确认（HITL · Gate 策略 HUMAN）。'
      };
      var text = bank[scene] || ('围绕目标「' + (vars && vars.goal ? vars.goal : scene) + '」继续 ReAct 循环。');
      return delayed('LLM', 'react.thought(' + scene + ')', function () {
        return {
          model: MockLLM.model,
          result: { thought: text },
          prompt_tokens: rand(800, 1800),
          completion_tokens: Math.floor(text.length / 1.4),
          latency_ms: rand(300, 900)
        };
      }, 350, 800);
    },

    /* LLM Gate 判定 */
    gate: function (subtaskName, policy) {
      return delayed('LLM', 'gate_subtask LLM 判定', function () {
        var pass = true;
        return {
          model: MockLLM.model,
          result: {
            gate: pass ? 'PASS' : 'REJECT',
            policy: policy || 'LLM',
            needs_human: policy === 'HUMAN' || policy === 'BOTH',
            score: rand(90, 99) / 100,
            reason: '子活动「' + subtaskName + '」产出与需求一致：目标字段 order.order_id 正确、校验口径符合 RULE-0101（完整性·非空）、试运行无报错，判定通过。'
          },
          prompt_tokens: rand(1200, 2000),
          completion_tokens: rand(100, 180),
          latency_ms: rand(400, 900)
        };
      });
    },

    /* Finish 判断（summary/followups 可按命中的业务活动传入 · 扩展 v3 §4） */
    finishCheck: function (summary, followups) {
      return delayed('LLM', 'finish_check 任务 Finish 判断', function () {
        return {
          model: MockLLM.model,
          result: {
            finished: true,
            summary: summary || '4 个子业务活动全部通过：本体探查 → 规则查找 → 探针生成 → 探针验证落库（每个子活动 Gate 均人工确认通过）。SQL/Python 探针已落库（PRB-2001/PRB-2002 · RULE-0101），调度计划注册成功（每天 00:00）。',
            followups: followups || ['首次调度运行后回查 probe_run 结果', '如需阈值放宽可新增探针阈值', '在规则管理查看 RULE-0101 关联探针（2 → 4）']
          },
          prompt_tokens: rand(2200, 3200),
          completion_tokens: rand(120, 240),
          latency_ms: rand(400, 900)
        };
      });
    },

    /* 生成 SQL 探针代码 */
    genSQLProbe: function () {
      return delayed('LLM', 'llm.generate(SQL-probe)', function () {
        return {
          model: MockLLM.model,
          result: {
            probe_type: 'SQL',
            code: [
              '-- 数据质量探针 · SQL · 完整性（非空校验）',
              '-- 目标: ods_order_detail.order_id   规则: RULE-0101',
              'SELECT',
              '  COUNT(1)                                            AS total_rows,',
              "  SUM(CASE WHEN order_id IS NULL OR order_id = '' THEN 1 ELSE 0 END) AS null_rows",
              'FROM ods_order_detail;',
              '-- 判定: null_rows = 0 → PASS；否则 FAIL 并回写告警'
            ].join('\n'),
            datasource_id: 'ds-01'
          },
          prompt_tokens: rand(1500, 2300),
          completion_tokens: rand(180, 320),
          latency_ms: rand(500, 1000)
        };
      }, 600, 1100);
    },

    /* 生成 Python 探针代码 */
    genPythonProbe: function () {
      return delayed('LLM', 'llm.generate(Python-probe)', function () {
        return {
          model: MockLLM.model,
          result: {
            probe_type: 'PYTHON',
            code: [
              '# 数据质量探针 · Python · 空值率阈值判定',
              'def probe(ctx):',
              '    df = ctx.sql("SELECT order_id FROM ods_order_detail")',
              '    total = len(df)',
              '    bad   = int(df["order_id"].isna().sum() + (df["order_id"] == "").sum())',
              '    ratio = bad / total if total else 0.0',
              '    return {',
              '        "status":   "PASS" if ratio == 0.0 else "FAIL",',
              '        "total":    total,',
              '        "bad":      bad,',
              '        "null_ratio": round(ratio, 6),',
              '        "threshold": 0.0,',
              '    }'
            ].join('\n')
          },
          prompt_tokens: rand(1600, 2600),
          completion_tokens: rand(200, 360),
          latency_ms: rand(500, 1000)
        };
      }, 600, 1100);
    }
  };

  /* ---------------------------------------------------------
   * MockOntology — 本体服务
   * --------------------------------------------------------- */
  var MockOntology = {
    lookup: function (keyword) {
      keyword = keyword || 'order';
      return delayed('本体', 'ontology.lookup("' + keyword + '")', function () {
        if (/cust|客户/.test(keyword)) {
          return {
            entities: [{ name: 'customer', table: 'dim_customer', comment: '客户主表', owner: '客户域' }],
            attributes: [{ name: 'cust_id', type: 'VARCHAR(32)', pk: true, nullable: false, comment: '客户主键' },
                         { name: 'mobile', type: 'VARCHAR(20)', pk: false, nullable: true, comment: '手机号' }],
            relationships: [{ from: 'customer', to: 'order', type: '1:N', key: 'cust_id' }]
          };
        }
        return {
          entities: [{ name: 'order', table: 'ods_order_detail', comment: '订单主表（贴源层）', owner: '数据中台', row_count: '1,048,576' }],
          attributes: [
            { name: 'order_id', type: 'VARCHAR(32)', pk: true, nullable: false, comment: '订单主键 · 业务单号', is_primary_key: true },
            { name: 'cust_id', type: 'VARCHAR(32)', pk: false, nullable: false, comment: '客户ID' },
            { name: 'amount', type: 'DECIMAL(18,2)', pk: false, nullable: true, comment: '订单金额' },
            { name: 'created_at', type: 'DATETIME', pk: false, nullable: false, comment: '下单时间' }
          ],
          relationships: [
            { from: 'order', to: 'order_item', type: '1:N', key: 'order_id' },
            { from: 'customer', to: 'order', type: '1:N', key: 'cust_id' }
          ]
        };
      });
    }
  };

  /* ---------------------------------------------------------
   * MockLineage — 血缘系统
   * --------------------------------------------------------- */
  var MockLineage = {
    query: function (table, field) {
      table = table || 'ods_order_detail';
      field = field || 'order_id';
      return delayed('血缘', 'lineage.query("' + table + '.' + field + '")', function () {
        return {
          node: table + '.' + field,
          upstream: [
            { src: 'mysql.crm_order.order_no', transform: 'ETL-0421 清洗映射（TRIM+大写前缀）', level: '字段级' },
            { src: 'kafka.order_created.event.orderNo', transform: '实时同步 ODS', level: '表级' }
          ],
          downstream: [
            { tgt: 'dws_order_stats.order_id', transform: '聚合：日订单量统计', level: '字段级' },
            { tgt: 'ads_risk_order_wide.order_id', transform: '风控宽表 JOIN 键', level: '字段级' }
          ],
          impact: '该字段为下游 2 张聚合/宽表表的 JOIN 键，空值会造成 JOIN 丢行 → 非空校验收益高。'
        };
      });
    }
  };

  /* ---------------------------------------------------------
   * MockRulebank — 规则库（rule.list 的底层返回，扩展 v2 §6 ST-2）
   * --------------------------------------------------------- */
  var MockRulebank = {
    list: function (keyword) {
      keyword = keyword || 'order.order_id';
      return delayed('规则库', 'rule.list(field="' + keyword + '")', function () {
        return {
          matched: 1,
          rules: [{
            rule_id: 'RULE-0101',
            name: '订单主键非空',
            dimension: '完整性',
            standard_id: 'STD-002',
            expression: 'order_id IS NOT NULL',
            judge: 'null_rows = 0 → PASS；否则 FAIL 并回写告警',
            field: 'ods_order_detail.order_id',
            existing_probes: ['PRB-0470（SQL · SCHEDULED）', 'PRB-0471（PYTHON · RUNNABLE）'],
            status: '生效'
          }]
        };
      });
    }
  };

  /* ---------------------------------------------------------
   * MockStandard — 标准管理系统（standard.list / 标准摘要 · 扩展 v3 §5）
   * --------------------------------------------------------- */
  var MockStandard = {
    list: function () {
      return delayed('标准', 'standard.list()', function () {
        return {
          standards: [
            { id: 'STD-001', name: '数据完整性标准', domain: '交易域', version: 'v2.3', status: '生效' },
            { id: 'STD-002', name: '主键质量规范', domain: '交易域', version: 'v1.8', status: '生效' },
            { id: 'STD-003', name: '多模态元数据标准', domain: '内容域', version: 'v1.2', status: '生效' },
            { id: 'STD-004', name: '客户信息一致性标准', domain: '客户域', version: 'v3.0', status: '生效' }
          ]
        };
      });
    },
    load: function (id) {
      id = id || 'STD-002';
      return delayed('标准', 'standard.load(' + id + ')', function () {
        var bank = {
          'STD-001': { id: 'STD-001', name: '数据完整性标准', version: 'v2.3', requirement: '核心业务表关键字段缺失率 = 0', dimension: '完整性' },
          'STD-002': { id: 'STD-002', name: '主键质量规范', version: 'v1.8', requirement: '所有业务主键必须配置非空+唯一探针', dimension: '完整性', applies: '交易域订单/客户域主键字段' },
          'STD-003': { id: 'STD-003', name: '多模态元数据标准', version: 'v1.2', requirement: '图片/音视频元数据字段齐全', dimension: '完整性' },
          'STD-004': { id: 'STD-004', name: '客户信息一致性标准', version: 'v3.0', requirement: '客户主数据跨源一致', dimension: '一致性' }
        };
        return bank[id] || { id: id, name: id, version: 'v1.0', requirement: '—', dimension: '—' };
      });
    }
  };

  /* ---------------------------------------------------------
   * MockRule — 规则库写操作（rule.upsert / rule.publish · 扩展 v3 §5）
   * 经 _delayed('Tool', ...) 模拟原子写入，返回 {rule_id, status, version}
   * --------------------------------------------------------- */
  var MockRule = {
    /* rule.list 底层沿用 MockRulebank（命中 RULE-0101） */
    list: function (keyword) { return MockRulebank.list(keyword); },
    upsert: function (rule) {
      rule = rule || {};
      return delayed('Tool', 'rule.upsert(' + (rule.rule_id || 'RULE-?') + ')', function () {
        return {
          rule_id: rule.rule_id || 'RULE-0107',
          name: rule.name || '订单主键非空',
          status: '草稿',
          version: 'v0.1',
          standard_id: rule.standard_id || 'STD-002',
          dimension: rule.dimension || '完整性',
          expression: rule.expression || 'order_id IS NOT NULL',
          judge: rule.judge || 'null_rows=0 → PASS'
        };
      });
    },
    publish: function (ruleId) {
      ruleId = ruleId || 'RULE-0107';
      return delayed('Tool', 'rule.publish(' + ruleId + ')', function () {
        return {
          rule_id: ruleId,
          status: '生效',
          version: 'v1',
          writeback: '已回写标准 STD-002（主键质量规范 v1.8）规则关联'
        };
      });
    }
  };

  /* ---------------------------------------------------------
   * MockDatasource — 数据源
   * --------------------------------------------------------- */
  var MockDatasource = {
    list: function () {
      return delayed('数据源', 'datasource.list()', function () {
        return [
          { id: 'ds-01', name: '订单主库', db_type: 'MySQL 8.0', connection_ref: 'conn://crm-order-ro' },
          { id: 'ds-02', name: '数据中台Doris', db_type: 'Doris 2.1', connection_ref: 'conn://dwh-doris' },
          { id: 'ds-03', name: '客户中心PG', db_type: 'PostgreSQL 16', connection_ref: 'conn://customer-pg' }
        ];
      });
    },
    runQuery: function (sql) {
      return delayed('数据源', 'sql.execute（试运行）', function () {
        return {
          datasource_id: 'ds-01',
          rows: [{ total_rows: 1048576, null_rows: 0 }],
          scanned_rows: 1048576,
          duration_ms: rand(120, 460),
          sql_preview: String(sql || '').split('\n')[0] + ' …'
        };
      });
    }
  };

  /* ---------------------------------------------------------
   * MockProbeRunner — 探针执行器
   * --------------------------------------------------------- */
  var MockProbeRunner = {
    runSQL: function (probeId) {
      return delayed('执行器', 'probe.run(SQL ' + (probeId || '-') + ')', function () {
        var bad = 0;
        return {
          run_id: rid('run'), probe_id: probeId || 'PRB-X', engine: 'SQL / Doris',
          status: bad === 0 ? 'PASS' : 'FAIL',
          metrics: { total_rows: 1048576, null_rows: bad, pass_rate: '100.00%' },
          started_at: '2026-10-11 00:00:02', finished_at: '2026-10-11 00:00:04', duration_ms: rand(1500, 2600)
        };
      });
    },
    runPython: function (probeId) {
      return delayed('执行器', 'probe.run(PYTHON ' + (probeId || '-') + ')', function () {
        return {
          run_id: rid('run'), probe_id: probeId || 'PRB-X', engine: 'Python 3.11 / pandas',
          status: 'PASS',
          metrics: { total_rows: 1048576, bad_rows: 0, null_ratio: 0.0, threshold: 0.0 },
          stdout: 'probe() → {"status":"PASS","total":1048576,"bad":0,"null_ratio":0.0}',
          started_at: '2026-10-11 00:00:05', finished_at: '2026-10-11 00:00:08', duration_ms: rand(2400, 4200)
        };
      });
    }
  };

  /* ---------------------------------------------------------
   * MockScheduler — 调度服务
   * --------------------------------------------------------- */
  var MockScheduler = {
    createSchedule: function (probeId, cronText) {
      cronText = cronText || '0 0 * * *';
      return delayed('调度', 'probe.schedule(' + (probeId || '-') + ', "' + cronText + '")', function () {
        return {
          schedule_id: rid('sch'),
          probe_id: probeId || 'PRB-X',
          cron: cronText,
          human: '每天 00:00（凌晨）执行',
          next_run: '2026-10-12 00:00:00',
          retry_policy: '失败重试 2 次，间隔 10 分钟；结果回写 probe_run',
          engine: 'APScheduler（生产：Celery Beat）'
        };
      });
    },
    history: function (targetId) {
      return delayed('调度', 'scheduler.history(' + (targetId || '-') + ')', function () {
        return [
          { run: 'R-2312', at: '2026-10-11 00:00', status: 'PASS', cost: '2.0s' },
          { run: 'R-2311', at: '2026-10-10 00:00', status: 'PASS', cost: '2.1s' },
          { run: 'R-2310', at: '2026-10-09 00:00', status: 'PASS', cost: '1.9s' },
          { run: 'R-2309', at: '2026-10-08 00:00', status: 'FAIL', cost: '3.4s', err: 'null_rows=12 → 已告警并回写' },
          { run: 'R-2308', at: '2026-10-07 00:00', status: 'PASS', cost: '1.8s' }
        ];
      });
    }
  };

  /* ---------------------------------------------------------
   * MockKnowledgeTool — knowledge.load 的底层返回（供 Tool 层调用）
   * --------------------------------------------------------- */
  var MockKnowledge = {
    load: function (knId) {
      return delayed('知识', 'knowledge.load(' + knId + ')', function () {
        var bank = {
          'KN-01': { title: '本体 · 表/字段/关系', snippet: '实体 order → ods_order_detail；属性 order_id 带 PK 标记、NOT NULL；关系 order:order_item = 1:N。', source: '本体服务（自动加载）', perm: '租户级 · 已授权' },
          'KN-02': { title: '血缘 · 表级+字段级', snippet: 'order.order_id 上游 mysql.crm_order.order_no；下游 dws_order_stats / ads_risk_order_wide（JOIN 键）。', source: '血缘系统（自动加载）', perm: '租户级 · 已授权' },
          'KN-03': { title: '规则库 · RULE-0101', snippet: '订单主键非空（完整性）：order_id IS NOT NULL；判定口径 null_rows=0 → PASS。', source: '标准管理系统', perm: '业务活动级 · 已授权' },
          'KN-04': { title: '标准库 · STD-002', snippet: '主键质量规范 v1.8：所有业务主键必须配置非空+唯一探针。', source: '标准管理系统', perm: '业务活动级 · 已授权' },
          'KN-05': { title: '文档 · ETL-0421 说明', snippet: '清洗映射逻辑：TRIM + 大写前缀 ORD-。', source: '文档库', perm: '子业务活动级 · 受限（仅摘要）' }
        };
        return bank[knId] || { title: knId, snippet: '…', source: 'MOCK', perm: '未知' };
      });
    }
  };

  global.DQMock = {
    MockLLM: MockLLM,
    MockOntology: MockOntology,
    MockLineage: MockLineage,
    MockRulebank: MockRulebank,
    MockRule: MockRule,
    MockStandard: MockStandard,
    MockDatasource: MockDatasource,
    MockProbeRunner: MockProbeRunner,
    MockScheduler: MockScheduler,
    MockKnowledge: MockKnowledge,
    _rid: rid,
    _delayed: delayed
  };

  console.log('%c[DQ-Prototype] mock.js 已加载：9 个 MOCK 外部系统挂载于 window.DQMock（含标准库/规则写操作）', 'color:#4f7cff;font-weight:bold;');
})(window);
