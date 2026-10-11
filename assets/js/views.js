/* ============================================================
 * views.js — 工作台 / 链路追踪 视图（业务资产已拆分至 manage.js：
 * 规则管理 #/rules + 产物探针 #/probes）
 * 注册到 DQRouter；对话管理与配置态视图分别在 runtime.js / config.js。
 * ============================================================ */
(function (global) {
  'use strict';
  var S = global.DQState, U = global.DQUI, R = global.DQRouter;

  /* ===================== 1. 工作台 Dashboard ===================== */
  function kpiNum(v) { return '<div class="num">' + v + '</div>'; }

  function renderDashboard(el) {
    var toolCount = S.allTools().length;
    var schedCount = S.probes.filter(function (p) { return p.status === 'SCHEDULED'; }).length;
    var ruleOn = S.rules.filter(function (r) { return r.status === '生效'; }).length;
    el.innerHTML =
      '<div class="section-title"><h2>工作台</h2><span class="sub">配置态 + 对话管理 + 编排管理 全景入口 · 外部系统全部 MOCK</span></div>' +
      '<div class="grid kpi-grid" id="kpi-grid">' +
        '<div class="card kpi">' + kpiNum(S.businessActivities.length) + '<div class="lbl">业务活动</div><div class="trend">已发布 ' + S.businessActivities.filter(function (b) { return b.status === 'PUBLISHED'; }).length + ' · 草稿 ' + S.businessActivities.filter(function (b) { return b.status !== 'PUBLISHED'; }).length + '</div></div>' +
        '<div class="card kpi">' + kpiNum(S.subtasks.length) + '<div class="lbl">子业务活动</div><div class="trend">Gate 策略：每子活动人工确认</div></div>' +
        '<div class="card kpi">' + kpiNum(S.skills.length) + '<div class="lbl">Skill（能力包）</div><div class="trend">渐进披露 L0/L1/L2</div></div>' +
        '<div class="card kpi">' + kpiNum(toolCount) + '<div class="lbl">Tool（内置 ' + S.builtinTools.length + ' + 注册 ' + S.registeredTools.length + '）</div><div class="trend">原子能力</div></div>' +
        '<div class="card kpi">' + kpiNum(S.rules.length) + '<div class="lbl">规则</div><div class="trend">生效 ' + ruleOn + ' · 草稿 ' + (S.rules.length - ruleOn) + '</div></div>' +
        '<div class="card kpi">' + kpiNum(S.probes.length) + '<div class="lbl">探针</div><div class="trend">SCHEDULED ' + schedCount + '</div></div>' +
        '<div class="card kpi"><div class="num teal">' + S.kpi.probeSuccessRate.toFixed(1) + '<span style="font-size:14px">%</span></div><div class="lbl">探针成功率</div><div class="trend">&#9650; 近 7 日</div></div>' +
      '</div>' +

      '<div class="grid journey-grid" style="margin-top:16px">' +
        '<div class="card journey cfg hoverable" data-go="config">' +
          '<div class="head"><div class="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M19.1 4.9l-2.8 2.8M7.7 16.3l-2.8 2.8"/></svg></div><h2>配置态 · Config Workbench</h2></div>' +
          '<p>业务人员自编排（P1）：注册原子 Tool，组合 Skill 能力包，配置子业务活动与知识白名单，编排并发布业务活动。</p>' +
          '<div class="chain">Tool 注册 &rarr; Skill 编写 &rarr; 子业务活动配置 &rarr; 业务活动编排 &rarr; 发布</div>' +
          '<button class="btn btn-primary" style="align-self:flex-start">进入配置向导</button>' +
        '</div>' +
        '<div class="card journey run hoverable" data-go="chat">' +
          '<div class="head"><div class="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 9h8M8 12h5"/></svg></div><h2>对话管理 · 对话即运行态</h2></div>' +
          '<p>在会话中自然语言发起诉求：三层路由命中意图，可见地路由至业务活动（探针生成 BA-01 / 规则生成 BA-02）；Planner 按白名单加载知识并规划子业务活动，ReAct 执行，每个子活动 Gate 均人工确认（HITL；演示模式可切换「一键全自动 / 手工逐步」），Finish 产出业务资产。</p>' +
          '<div class="chain">命中意图 &rarr; 路由业务活动 &rarr; 知识加载 &rarr; 规划 &rarr; 执行 &rarr; Gate &rarr; Finish</div>' +
          '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
            '<button class="btn btn-play" id="btn-demo">&#9654;&nbsp; 一键跑通 Demo：探针生成</button>' +
            '<button class="btn btn-amber" id="btn-demo-rule" style="align-self:flex-start">&#9654;&nbsp; 一键跑通 Demo：规则生成</button>' +
            '<button class="btn btn-ghost" style="align-self:center">进入对话管理</button>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="card" style="margin-top:16px">' +
        '<h3><span class="bar"></span>核心端到端剧本（双业务活动 · 对齐扩展 v3）</h3>' +
        '<div class="bubble" style="margin-bottom:10px">' + U.esc(S.demoRequest) + ' <span class="badge b-teal" style="float:right">Demo：探针生成</span></div>' +
        '<div class="small muted">系统：命中意图 RUN_PROBE_REQUEST &rarr; 路由至业务活动「探针生成业务活动」(BA-01) &rarr; 加载「本体 / 规则库」知识 &rarr; 规划 4 个子业务活动（本体探查 &rarr; 规则查找 &rarr; 探针生成 &rarr; 探针验证落库）&rarr; ReAct 执行（ontology.lookup / rule.list / sql.execute / python.run / probe.upsert / probe.schedule）&rarr; 子活动 Gate（ST-1~4 每个子活动均 HITL 人工确认 · 一键全自动/手工逐步）&rarr; 任务 Finish &rarr; 产出 PRB-2001（SQL）+ PRB-2002（PYTHON）归属 RULE-0101，关联探针 2&rarr;4，调度每天凌晨 00:00。' +
        '<a href="#/probes" style="color:var(--primary-2);margin-left:8px">查看产物探针 &rarr;</a> <a href="#/rules" style="color:var(--primary-2);margin-left:6px">查看规则管理 &rarr;</a></div>' +
        '<div class="bubble" style="margin:12px 0 10px">' + U.esc(S.demoRules) + ' <span class="badge b-amber" style="float:right">Demo：规则生成</span></div>' +
        '<div class="small muted">系统：命中意图 RUN_RULE_REQUEST &rarr; 路由至业务活动「规则生成业务活动」(BA-02) &rarr; 加载「本体 / 血缘 / 标准库 / 规则库」知识 &rarr; 规划 5 个子业务活动（本体探查 &rarr; 血缘探查 &rarr; 标准探查 &rarr; 规则生成 &rarr; 规则发布）&rarr; ReAct 执行（ontology.lookup / lineage.query / standard.list / knowledge.load / rule.upsert / rule.publish）&rarr; 子活动 Gate（ST-1~5 每个子活动均 HITL 人工确认 · 一键全自动/手工逐步）&rarr; 任务 Finish &rarr; 产出新规则 RULE-0107「订单主键非空」发布为「生效」并回写标准 STD-002。' +
        '<a href="#/rules" style="color:var(--primary-2);margin-left:8px">查看规则管理 &rarr;</a></div>' +
      '</div>' +

      '<div class="grid" style="margin-top:16px;grid-template-columns:1fr 1fr">' +
        '<div class="card" style="cursor:pointer" onclick="location.hash=\'#/activities\'">' +
          '<h3><span class="bar"></span>编排管理 <span class="small muted" style="font-weight:400">业务活动 · 子业务活动 · Skill · Tool</span></h3>' +
          '<div class="pill-list">' +
            '<span class="pill">探针生成业务活动 · 4 子活动</span><span class="pill">规则生成业务活动 · 5 子活动</span>' +
            '<span class="pill">Skill ' + S.skills.length + '</span><span class="pill">Tool ' + toolCount + '</span>' +
          '</div></div>' +
        '<div class="card" style="cursor:pointer" onclick="location.hash=\'#/rules\'">' +
          '<h3><span class="bar"></span>数据质量资产 <span class="small muted" style="font-weight:400">规则管理 · 产物探针</span></h3>' +
          '<div class="pill-list">' +
            '<span class="pill">规则 ' + S.rules.length + '（含执行统计/关联探针）</span><span class="pill">探针 ' + S.probes.length + '（SQL+PYTHON）</span>' +
          '</div></div>' +
      '</div>' +

      '<div class="card" style="margin-top:16px">' +
        '<h3><span class="bar"></span>最近运行</h3>' +
        (S.runs.length ? '<div class="list-plain">' + S.runs.slice(0, 4).map(function (r) {
          return '<div class="trace-row"><span class="ct ct-TOOL">RUN</span><span class="nd">' + U.esc(r.id) + ' · ' + U.esc(r.request) + '</span><span class="lat">' + U.esc(r.started_at) + '</span><span class="st-ok">' + U.esc(r.status) + '</span></div>';
        }).join('') + '</div>' : '<div class="small muted">暂无运行记录 —— 点击上方「&#9654; 一键跑通 Demo」开始。</div>') +
      '</div>';

    U.$$('#view .journey').forEach(function (c) {
      c.addEventListener('click', function (e) {
        if (e.target.closest('#btn-demo')) { startDemo('A'); return; }
        if (e.target.closest('#btn-demo-rule')) { startDemo('B'); return; }
        R.go(c.getAttribute('data-go'));
      });
    });
    var demoBtn = U.$('#btn-demo', el);
    if (demoBtn) demoBtn.addEventListener('click', function (e) { e.stopPropagation(); startDemo('A'); });
    var demoBtn2 = U.$('#btn-demo-rule', el);
    if (demoBtn2) demoBtn2.addEventListener('click', function (e) { e.stopPropagation(); startDemo('B'); });
  }

  /* dashboard 一键跑通：跳转对话管理并自动开播（A=探针生成 / B=规则生成，扩展 v3 §6） */
  function startDemo(which) {
    S.pendingDemo = which || 'A';
    R.go('chat');
  }

  /* ===================== 2. 链路追踪 Trace ===================== */
  var traceFilter = 'ALL';
  var callTypeBadge = { LLM: 'ct-LLM', TOOL: 'ct-TOOL' };

  function renderTrace(el) {
    el.innerHTML =
      '<div class="section-title"><h2>链路追踪</h2><span class="sub">每个 Step 的 LLM / TOOL 调用 · 时间轴 · 延迟 · Token</span></div>' +
      '<div class="card" style="padding:14px 18px;margin-bottom:14px"><div id="trace-stats" class="grid" style="grid-template-columns:repeat(4,1fr);gap:10px"></div></div>' +
      '<div class="tabs" id="trace-tabs">' +
        '<div class="tab" data-f="ALL">全部</div><div class="tab" data-f="LLM">仅 LLM</div><div class="tab" data-f="TOOL">仅 TOOL</div>' +
        '<span class="mock-tag" style="align-self:center;margin-left:6px">数据来自运行态真实打点</span>' +
      '</div><div id="trace-body"></div>';

    U.$$('#trace-tabs .tab', el).forEach(function (t) {
      t.classList.toggle('on', t.getAttribute('data-f') === traceFilter);
      t.addEventListener('click', function () {
        traceFilter = t.getAttribute('data-f');
        U.$$('#trace-tabs .tab', el).forEach(function (x) { x.classList.toggle('on', x === t); });
        drawTraceBody();
      });
    });
    drawTraceBody();
  }

  function traceRows() {
    return S.traces.filter(function (x) { return traceFilter === 'ALL' || x.call_type === traceFilter; });
  }

  function drawTraceBody() {
    var host = U.$('#trace-body');
    var stats = U.$('#trace-stats');
    if (!host) return;
    var rows = traceRows();
    var maxLat = Math.max.apply(null, rows.map(function (x) { return x.latency_ms; }).concat([1]));
    var llmN = S.traces.filter(function (x) { return x.call_type === 'LLM'; }).length;
    var toolN = S.traces.length - llmN;
    var total = S.traces.reduce(function (a, x) { return a + x.latency_ms; }, 0);
    if (stats) stats.innerHTML =
      '<div><div class="num mono" style="font-size:20px">' + S.traces.length + '</div><div class="small muted">总调用数</div></div>' +
      '<div><div class="num mono" style="font-size:20px;color:var(--primary-2)">' + llmN + '</div><div class="small muted">LLM 调用（prompt/completion 统计）</div></div>' +
      '<div><div class="num mono" style="font-size:20px;color:var(--teal)">' + toolN + '</div><div class="small muted">Tool 调用</div></div>' +
      '<div><div class="num mono" style="font-size:20px;color:var(--amber)">' + (total / 1000).toFixed(1) + 's</div><div class="small muted">累计耗时（模拟）</div></div>';

    if (!rows.length) {
      host.innerHTML = '<div class="empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3 12h4l3-9 4 18 3-9h4"/></svg><div>暂无 Trace 数据。<br>请先在 <a href="#/chat" style="color:var(--primary-2)">对话管理</a> 执行「&#9654; Demo：探针生成」或「&#9654; Demo：规则生成」，调用链将实时写入本页。</div></div>';
      return;
    }
    host.innerHTML = '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>时间</th><th>Run</th><th>类型</th><th>节点 / 调用</th><th style="min-width:150px">延迟</th><th>Token (in/out)</th><th>状态</th></tr></thead><tbody>' +
      rows.map(function (x) {
        var pct = Math.max(6, Math.round(x.latency_ms / maxLat * 100));
        var tk = x.call_type === 'LLM' ? (x.prompt_tokens + ' / ' + x.completion_tokens) : '<span class="muted">—</span>';
        return '<tr style="cursor:default"><td class="mono id">' + x.seq + '</td><td class="mono small muted">' + x.t + '</td><td class="mono small muted">' + U.esc(x.run_id || '-') + '</td>' +
          '<td><span class="ct ' + callTypeBadge[x.call_type] + '" style="font-size:10px;padding:2px 7px;border-radius:6px;font-weight:800">' + x.call_type + '</span></td>' +
          '<td class="mono" style="font-size:12px">' + U.esc(x.node) + (x.tool ? '<span class="badge b-teal" style="margin-left:6px;font-size:10px">' + U.esc(x.tool) + '</span>' : '') + '</td>' +
          '<td class="lat-cell"><div class="bar"><i style="--w:' + (pct / 100) + ';animation-delay:.1s"></i></div><div class="ms">' + x.latency_ms + ' ms</div></td>' +
          '<td class="mono small" style="color:var(--primary-2)">' + tk + '</td>' +
          '<td><span class="badge ' + (x.status === 'OK' ? 'b-ok' : x.status === 'WAIT_HITL' ? 'b-amber' : 'b-danger') + '">' + x.status + '</span></td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  /* 实时：运行中如在 Trace 页则增量重绘 */
  var redrawTimer = null;
  S.on(function (evt) {
    if (evt === 'trace:added' && R.current() === 'trace') {
      clearTimeout(redrawTimer);
      redrawTimer = setTimeout(drawTraceBody, 120);
    }
  });

  R.register('dashboard', { title: '工作台', en: 'Dashboard', render: renderDashboard });
  R.register('trace', { title: '链路追踪', en: 'Trace · LLM / Tool Timeline', render: renderTrace });

  console.log('%c[DQ-Prototype] views.js 已加载：Dashboard / Trace（管理视图见 manage.js）', 'color:#4f7cff;font-weight:bold;');
})(window);
