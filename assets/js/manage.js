/* ============================================================
 * manage.js — 管理模块 6 视图（扩展规范 v2 §3）
 *   #/activities  业务活动管理（内部实体 Agent，用户层面不显示该字样）
 *   #/subtasks    子业务活动管理（内部实体 Task）
 *   #/skills      Skill 管理
 *   #/tools       Tool 管理
 *   #/rules       规则管理（关联探针动态计算 + 执行次数/成功率/趋势/历史）
 *   #/probes      产物探针管理（新生成插入顶部并高亮）
 * 全部复用既有设计系统 class（card/badge/tbl/drawer/pill/mock-tag/btn）。
 * ============================================================ */
(function (global) {
  'use strict';
  var S = global.DQState, M = global.DQMock, U = global.DQUI, R = global.DQRouter;
  var esc = U.esc;

  /* ---------- 通用徽章 / 小组件 ---------- */
  var dimBadge = { '完整性': 'b-teal', '准确性': 'b-blue', '一致性': 'b-blue', '及时性': 'b-amber', '唯一性': 'b-teal', '有效性': 'b-amber' };
  var probeBadge = { DRAFT: 'b-dim', RUNNABLE: 'b-teal', SCHEDULED: 'b-ok' };
  var kindBadge = { KNOWLEDGE: 'b-teal', SQL: 'b-blue', PYTHON: 'b-teal', QUERY: 'b-dim', IO: 'b-amber' };
  var gateBadge = { LLM: 'b-blue', HUMAN: 'b-amber', BOTH: 'b-amber' };
  var discBadge = { L0: 'b-dim', L1: 'b-blue', L2: 'b-teal' };

  function statusZh(st) { return st === 'PUBLISHED' ? '已发布' : (st === '生效' ? '生效' : '草稿'); }
  function ruleStatusBadge(r) { return '<span class="badge ' + (r.status === '生效' ? 'b-ok' : 'b-dim') + '">' + esc(r.status) + '</span>'; }
  function typeBadge(t) { return '<span class="badge ' + (t === 'SQL' ? 'b-blue' : 'b-teal') + '">' + t + '</span>'; }
  function probeStatusBadge(p) { return '<span class="badge ' + (probeBadge[p.status] || 'b-dim') + '">' + p.status + '</span>'; }
  var gateLabel = { LLM: 'LLM 判断', HUMAN: '人工确认', BOTH: 'LLM+人工' };
  function gateB(g) { return '<span class="badge ' + (gateBadge[g] || 'b-dim') + '">Gate ' + (gateLabel[g] || g) + '</span>'; }
  function fmtRate(v) { return (v == null) ? '<span class="muted">—</span>' : '<b style="color:var(--ok)">' + v + '%</b>'; }
  function numOr(v, dflt) { return (v == null) ? '<span class="muted">' + (dflt || '—') + '</span>' : v; }

  /* 成功率进度条（纯 CSS，动画仅 transform/width 装饰） */
  function rateBar(pct) {
    if (pct == null) return '<div class="rate"><div class="bar"><i style="width:0%"></i></div><span class="rv muted">—</span></div>';
    var w = Math.max(2, Math.min(100, pct));
    var tone = pct >= 99 ? 'hi' : (pct >= 95 ? '' : (pct >= 90 ? 'mid' : 'low'));
    return '<div class="rate"><div class="bar"><i class="' + tone + '" style="width:' + w + '%"></i></div><span class="rv mono">' + pct + '%</span></div>';
  }
  /* 最近 7 次趋势迷你柱（1=通过 0=失败） */
  function trendBars(trend) {
    if (!trend || !trend.length) return '<span class="muted small">暂无趋势数据</span>';
    return '<div class="spark">' + trend.map(function (v, i) {
      return '<i class="' + (v ? 'pass' : 'fail') + '" style="height:' + (v ? 60 + (i % 3) * 15 : 34) + '%" title="第 ' + (i + 1) + ' 次：' + (v ? 'PASS' : 'FAIL') + '"></i>';
    }).join('') + '</div>';
  }
  function pills(ids, prefix) {
    if (!ids || !ids.length) return '<span class="muted small">—</span>';
    return '<div class="pill-list">' + ids.map(function (x) { return '<span class="pill">' + esc((prefix || '') + x) + '</span>'; }).join('') + '</div>';
  }

  /* ---------- 新生成探针高亮（沿用 DQAssetsMarkFresh 机制） ---------- */
  var freshProbeIds = {};
  global.DQAssetsMarkFresh = function (ids) {
    ids.forEach(function (id) { freshProbeIds[id] = true; });
  };

  /* ============================================================
   * 1. 业务活动管理 #/activities
   * ============================================================ */
  function baStats(ba) {
    return {
      sub: S.activitySubtaskIds(ba).length,
      skill: S.activitySkillIds(ba).length,
      tool: S.activityToolIds(ba).length,
      kn: (ba.knowledge_ids || []).length
    };
  }

  function renderActivities(el) {
    el.innerHTML =
      '<div class="section-title"><h2>业务活动管理</h2><span class="sub">业务活动 = 可发布的端到端业务旅程（子业务活动链 + Skill + Tool + 知识白名单）</span>' +
      '<span class="mock-tag" style="margin-left:6px">MOCK 种子数据</span>' +
      '<button class="btn btn-primary small" id="btn-new-ba" style="margin-left:auto;padding:7px 14px;font-size:12.5px">＋ 新建业务活动</button></div>' +
      '<div id="ba-note" class="small muted" style="margin:-4px 0 12px"></div>' +
      '<div class="ba-grid">' +
      S.businessActivities.map(function (ba) {
        var st = baStats(ba);
        return '<div class="card hoverable ba-card" data-ba="' + ba.id + '">' +
          '<div class="k-t"><span class="idc mono">' + esc(ba.id) + '</span><b>' + esc(ba.name) + '</b>' +
          '<span class="badge ' + (ba.status === 'PUBLISHED' ? 'b-ok' : 'b-dim') + '" style="margin-left:auto">' + statusZh(ba.status) + '</span></div>' +
          '<p class="ba-desc">' + esc(ba.description || '') + '</p>' +
          '<div class="ba-stats"><span>子业务活动 <b>' + st.sub + '</b></span><span class="sepa">·</span><span>Skill <b>' + st.skill + '</b></span><span class="sepa">·</span><span>Tool <b>' + st.tool + '</b></span><span class="sepa">·</span><span>知识 <b>' + st.kn + '</b></span></div>' +
          '<div class="ba-foot"><span class="muted small">' + esc(ba.created_by || '-') + ' · ' + esc(ba.created_at || '-') + '</span><span class="link-hint">查看编排详情 &rarr;</span></div>' +
          '</div>';
      }).join('') + '</div>' +
      '<div class="card" style="margin-top:16px"><h3><span class="bar"></span>编排链说明</h3>' +
      '<div class="chain small mono" style="font-family:var(--mono)">业务活动 &rarr; 子业务活动（1:N） &rarr; Skill（1:N） &rarr; Tool（1:N） · 知识白名单挂在业务活动/子业务活动两级（P5）</div></div>';

    U.$$('#view .ba-card', el).forEach(function (c) {
      c.addEventListener('click', function () { openBADetail(c.getAttribute('data-ba')); });
    });
    U.$('#btn-new-ba', el).addEventListener('click', function () {
      U.$('#ba-note').innerHTML = '可前往 <a href="#/config" style="color:var(--primary-2)">「配置态」4 步向导</a> 新建业务活动（Tool 注册 → Skill 编写 → 子业务活动配置 → 业务活动编排），发布后在此展示。正在跳转…';
      setTimeout(function () { R.go('config'); }, 750);
    });
  }

  function openBADetail(id) {
    var ba = S.getActivity(id); if (!ba) return;
    var subIds = S.activitySubtaskIds(ba);
    var html =
      '<div class="kv"><span class="k">编号</span><b class="mono">' + esc(ba.id) + '</b>' +
      '<span class="k">名称</span><b>' + esc(ba.name) + '</b>' +
      '<span class="k">状态</span><span class="badge ' + (ba.status === 'PUBLISHED' ? 'b-ok' : 'b-dim') + '">' + statusZh(ba.status) + '</span>' +
      '<span class="k">描述</span><span>' + esc(ba.description || ba.business_activity || '-') + '</span>' +
      '<span class="k">创建</span><span>' + esc(ba.created_by || '-') + ' · ' + esc(ba.created_at || '-') + '</span></div>' +
      '<div class="divider"></div><h3 style="font-size:13px">子业务活动链（' + subIds.length + '）<a href="#/subtasks" class="link-hint" style="float:right;font-size:11px">子业务活动管理 &rarr;</a></h3>' +
      '<div class="list-plain">' + subIds.map(function (sid) {
        var t = S.getSubtask(sid); if (!t) return '';
        return '<div class="trace-row"><span class="ct ct-TOOL">' + esc(t.id) + '</span><span class="nd" style="white-space:normal">' + esc(t.name) + ' · ' + esc(t.goal) + '</span>' + gateB(t.gate_policy) + '</div>';
      }).join('') + '</div>' +
      '<div class="divider"></div><h3 style="font-size:13px">绑定 Skill（' + S.activitySkillIds(ba).length + '）</h3>' + pills(S.activitySkillIds(ba)) +
      '<div class="divider"></div><h3 style="font-size:13px">绑定 Tool（' + S.activityToolIds(ba).length + '）</h3>' + pills(S.activityToolIds(ba)) +
      '<div class="divider"></div><h3 style="font-size:13px">知识白名单（' + (ba.knowledge_ids || []).length + '）</h3>' + pills(ba.knowledge_ids);
    U.openDrawer('业务活动 · ' + ba.name, html);
  }

  /* ============================================================
   * 2. 子业务活动管理 #/subtasks
   * ============================================================ */
  var subFilter = 'ALL';

  function baOfSubtask(t) {
    if (t.ba_id && S.getActivity(t.ba_id)) return S.getActivity(t.ba_id);
    var hit = S.businessActivities.filter(function (ba) {
      return S.activitySubtaskIds(ba).indexOf(t.id) >= 0;
    })[0];
    return hit || null;
  }

  function renderSubtasks(el) {
    var tabs = [{ v: 'ALL', t: '全部' }].concat(S.businessActivities.map(function (ba) { return { v: ba.id, t: ba.name }; }));
    el.innerHTML =
      '<div class="section-title"><h2>子业务活动管理</h2><span class="sub">子业务活动 = 业务活动内一段可 Gate 判定的目标单元（绑定 Skill / 知识白名单 / Gate 策略）</span></div>' +
      '<div class="tabs" id="sub-tabs">' + tabs.map(function (x) {
        return '<div class="tab' + (x.v === subFilter ? ' on' : '') + '" data-v="' + x.v + '">' + esc(x.t) + '</div>';
      }).join('') + '</div><div id="sub-body"></div>';

    U.$$('#sub-tabs .tab', el).forEach(function (tb) {
      tb.addEventListener('click', function () {
        subFilter = tb.getAttribute('data-v');
        U.$$('#sub-tabs .tab', el).forEach(function (x) { x.classList.toggle('on', x === tb); });
        drawSubBody();
      });
    });
    drawSubBody();
  }

  function drawSubBody() {
    var host = U.$('#sub-body'); if (!host) return;
    var rows = S.subtasks.filter(function (t) {
      if (subFilter === 'ALL') return true;
      var b = baOfSubtask(t);
      return !!b && b.id === subFilter;
    });
    host.innerHTML = '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>编号</th><th>所属业务活动</th><th>名称</th><th>目标</th><th>顺序</th><th>Gate 策略</th><th>引用 Skill</th><th>知识</th></tr></thead><tbody>' +
      rows.map(function (t) {
        var b = baOfSubtask(t);
        return '<tr data-sub="' + t.id + '"><td class="id">' + esc(t.id) + '</td>' +
          '<td class="small">' + (b ? esc(b.name) : '<span class="muted">未编排</span>') + '</td>' +
          '<td><b>' + esc(t.name) + '</b>' + (t.created_by_user ? ' <span class="badge b-teal">新</span>' : '') + '</td>' +
          '<td class="small muted" style="max-width:260px">' + esc(t.goal) + '</td>' +
          '<td class="mono small">' + t.order_index + '</td>' +
          '<td>' + gateB(t.gate_policy) + '</td>' +
          '<td>' + pills(t.skill_ids) + '</td>' +
          '<td>' + pills(t.knowledge_ids) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    U.$$('tr[data-sub]', host).forEach(function (tr) {
      tr.addEventListener('click', function () { openSubDetail(tr.getAttribute('data-sub')); });
    });
  }

  function openSubDetail(id) {
    var t = S.getSubtask(id); if (!t) return;
    var b = baOfSubtask(t);
    var gateDesc = t.gate_policy === 'BOTH' ? 'LLM 判断 + 人工确认（HITL 中断点，通过 interrupt/Command(resume) 恢复）'
      : t.gate_policy === 'HUMAN' ? '人工确认（HITL）：本子活动 ReAct 执行完成后，在「子活动 Gate 判定」处中断挂起，由业务人员点击 通过/驳回/修改 后继续；驳回则终止本次运行（演示模式为「一键全自动」时自动确认）'
      : 'LLM 自动判定产出质量，通过后进入下一子业务活动';
    var html =
      '<div class="kv"><span class="k">编号</span><b class="mono">' + esc(t.id) + '</b>' +
      '<span class="k">所属业务活动</span><span>' + (b ? esc(b.name) + '（' + esc(b.id) + '）' : '未编排') + '</span>' +
      '<span class="k">名称</span><b>' + esc(t.name) + '</b>' +
      '<span class="k">目标</span><span>' + esc(t.goal) + '</span>' +
      '<span class="k">顺序</span><span class="mono">' + t.order_index + '</span>' +
      '<span class="k">Gate 策略</span><span>' + gateB(t.gate_policy) + '</span></div>' +
      '<div class="divider"></div><h3 style="font-size:13px">引用 Skill（含 Tool）</h3>' +
      '<div class="list-plain">' + (t.skill_ids || []).map(function (sid) {
        var k = S.skills.filter(function (x) { return x.id === sid; })[0];
        if (!k) return '<div class="trace-row"><span class="ct ct-TOOL">' + esc(sid) + '</span><span class="nd muted">（未登记 Skill）</span></div>';
        return '<div class="kn-card' + (k.created_by_user ? ' done' : '') + '"><div class="k-t">' + esc(k.id) + ' · ' + esc(k.name) +
          '<span class="badge ' + (discBadge[k.disclosure] || 'b-dim') + '">' + k.disclosure + '</span></div>' +
          '<div class="pill-list">' + (k.tools || []).map(function (x) { return '<span class="pill">' + esc(x) + '</span>'; }).join('') + '</div>' +
          '<div class="small snippet muted" style="margin-top:6px">' + esc(k.prompt) + '</div></div>';
      }).join('') + '</div>' +
      '<div class="divider"></div><h3 style="font-size:13px">知识白名单（P5 · 规划期按需加载）</h3>' +
      (t.knowledge_ids && t.knowledge_ids.length ? pills(t.knowledge_ids) : '<span class="muted small">不加载额外知识</span>') +
      '<div class="divider"></div><h3 style="font-size:13px">Gate 判定说明</h3><div class="small muted">' + gateDesc + '。</div>';
    U.openDrawer('子业务活动 · ' + t.name, html);
  }

  /* ============================================================
   * 3. Skill 管理 #/skills
   * ============================================================ */
  function renderSkills(el) {
    el.innerHTML =
      '<div class="section-title"><h2>Skill 管理</h2><span class="sub">能力包 = 多个 Tool + Prompt 模板，归属子业务活动 · 渐进披露 L0/L1/L2（spec §7.1）</span></div>' +
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>编号</th><th>名称</th><th>归属子业务活动</th><th>渐进披露</th><th>引用 Tool</th><th>描述</th></tr></thead><tbody>' +
      S.skills.map(function (k) {
        var t = S.getSubtask(k.subtask_id);
        return '<tr data-skill="' + k.id + '"><td class="id">' + esc(k.id) + '</td>' +
          '<td><b>' + esc(k.name) + '</b>' + (k.created_by_user ? ' <span class="badge b-teal">新</span>' : '') + '</td>' +
          '<td class="mono small">' + esc(k.subtask_id || '-') + (t ? '<span class="muted"> · ' + esc(t.name) + '</span>' : '') + '</td>' +
          '<td><span class="badge ' + (discBadge[k.disclosure] || 'b-dim') + '">' + esc(k.disclosure) + '</span></td>' +
          '<td>' + pills(k.tools) + '</td>' +
          '<td class="small muted" style="max-width:300px">' + esc(k.prompt) + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<div class="small muted" style="margin-top:10px">默认只注入 L0 元数据，命中 Skill 后逐级展开 L1 摘要 / L2 完整（Prompt + schema + 示例），节省上下文。</div>';

    U.$$('#view tr[data-skill]').forEach(function (tr) {
      tr.addEventListener('click', function () { openSkillDetail(tr.getAttribute('data-skill')); });
    });
  }

  function openSkillDetail(id) {
    var k = S.skills.filter(function (x) { return x.id === id; })[0]; if (!k) return;
    var t = S.getSubtask(k.subtask_id);
    var b = t ? baOfSubtask(t) : null;
    var ladder = [
      ['L0', '元数据：仅 name/description，用于路由与选择'],
      ['L1', '摘要：能力说明 + 所需 Tool 列表'],
      ['L2', '完整：Prompt 模板 + Tool schema + 示例']
    ];
    var html =
      '<div class="kv"><span class="k">编号</span><b class="mono">' + esc(k.id) + '</b>' +
      '<span class="k">名称</span><b>' + esc(k.name) + '</b>' +
      '<span class="k">归属</span><span>' + esc(k.subtask_id || '-') + (t ? ' · ' + esc(t.name) : '') + (b ? '（' + esc(b.name) + '）' : '') + '</span>' +
      '<span class="k">披露层级</span><span class="badge ' + (discBadge[k.disclosure] || 'b-dim') + '">' + esc(k.disclosure) + '</span></div>' +
      '<div class="divider"></div><h3 style="font-size:13px;margin-bottom:8px">Prompt 模板</h3>' + U.codeBlock(k.prompt) +
      '<div class="divider"></div><h3 style="font-size:13px;margin-bottom:8px">引用 Tool（' + (k.tools || []).length + ' · 含 schema）</h3>' +
      '<div class="list-plain">' + (k.tools || []).map(function (name) {
        var tool = S.allTools().filter(function (x) { return x.name === name; })[0];
        return '<div class="kn-card"><div class="k-t">' + esc(name) + (tool ? '<span class="badge ' + (kindBadge[tool.kind] || 'b-dim') + '">' + tool.kind + '</span>' : '<span class="badge b-danger">未登记</span>') + '</div>' +
          (tool ? '<div class="small snippet muted">' + esc(tool.desc) + '</div><pre class="code" style="margin-top:6px;max-height:110px">' + esc(tool.schema) + '</pre>' : '') + '</div>';
      }).join('') + '</div>' +
      '<div class="divider"></div><h3 style="font-size:13px">渐进披露阶梯</h3>' +
      ladder.map(function (l) {
        return '<div class="trace-row" style="cursor:default"><span class="ct ' + (l[0] === k.disclosure ? 'ct-LLM' : 'ct-TOOL') + '">' + l[0] + '</span><span class="nd" style="white-space:normal">' + l[1] + (l[0] === k.disclosure ? ' <b style="color:var(--teal)">← 当前</b>' : '') + '</span></div>';
      }).join('');
    U.openDrawer('Skill · ' + k.name, html);
  }

  /* ============================================================
   * 4. Tool 管理 #/tools
   * ============================================================ */
  var toolFilter = 'ALL';

  function renderTools(el) {
    var kinds = ['ALL', 'KNOWLEDGE', 'SQL', 'PYTHON', 'QUERY', 'IO'];
    el.innerHTML =
      '<div class="section-title"><h2>Tool 管理</h2><span class="sub">原子能力（内置 ' + S.builtinTools.length + ' + 开放注册 ' + S.registeredTools.length + '）· 被引用次数 = 引用该 Tool 的 Skill 数</span></div>' +
      '<div class="tabs" id="tool-tabs">' + kinds.map(function (k) {
        return '<div class="tab' + (k === toolFilter ? ' on' : '') + '" data-v="' + k + '">' + (k === 'ALL' ? '全部' : k) + '</div>';
      }).join('') + '</div><div id="tool-body"></div>';

    U.$$('#tool-tabs .tab', el).forEach(function (tb) {
      tb.addEventListener('click', function () {
        toolFilter = tb.getAttribute('data-v');
        U.$$('#tool-tabs .tab', el).forEach(function (x) { x.classList.toggle('on', x === tb); });
        drawToolBody();
      });
    });
    drawToolBody();
  }

  function drawToolBody() {
    var host = U.$('#tool-body'); if (!host) return;
    var rows = S.allTools().filter(function (t) { return toolFilter === 'ALL' || t.kind === toolFilter; });
    host.innerHTML = '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Tool 名</th><th>kind</th><th>category</th><th>描述</th><th>schema</th><th>被引用次数</th></tr></thead><tbody>' +
      rows.map(function (t) {
        var ref = S.toolRefCount(t.name);
        return '<tr data-tool="' + esc(t.name) + '"><td class="id">' + esc(t.name) + '</td>' +
          '<td><span class="badge ' + (kindBadge[t.kind] || 'b-dim') + '">' + esc(t.kind) + '</span></td>' +
          '<td><span class="badge ' + (t.category === 'BUILTIN' ? 'b-dim' : 'b-blue') + '">' + (t.category === 'BUILTIN' ? '内置' : '注册') + '</span></td>' +
          '<td class="small">' + esc(t.desc) + '</td>' +
          '<td class="mono small muted" style="max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(t.schema) + '</td>' +
          '<td><b class="mono" style="color:' + (ref ? 'var(--teal)' : 'var(--text-dim)') + '">' + ref + '</b><span class="muted small"> Skill</span></td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<div class="small muted" style="margin-top:10px">内置 Tool 随租户开租注入；开放注册 Tool 经 tool.register 网关接入（鉴权/限流/版本，演示省略）。向导中新注册的 Tool 会实时出现在此。</div>';
    U.$$('tr[data-tool]', host).forEach(function (tr) {
      tr.addEventListener('click', function () { openToolDetail(tr.getAttribute('data-tool')); });
    });
  }

  function openToolDetail(name) {
    var t = S.allTools().filter(function (x) { return x.name === name; })[0]; if (!t) return;
    var refSkills = S.skills.filter(function (k) { return (k.tools || []).indexOf(name) >= 0; });
    var html =
      '<div class="kv"><span class="k">Tool 名</span><b class="mono">' + esc(t.name) + '</b>' +
      '<span class="k">kind</span><span class="badge ' + (kindBadge[t.kind] || 'b-dim') + '">' + esc(t.kind) + '</span>' +
      '<span class="k">category</span><span class="badge ' + (t.category === 'BUILTIN' ? 'b-dim' : 'b-blue') + '">' + (t.category === 'BUILTIN' ? '内置' : '开放注册') + '</span>' +
      '<span class="k">描述</span><span>' + esc(t.desc) + '</span>' +
      '<span class="k">被引用</span><span><b style="color:var(--teal)">' + refSkills.length + '</b> 个 Skill 引用本 Tool</span></div>' +
      '<div class="divider"></div><h3 style="font-size:13px;margin-bottom:8px">schema（入参/出参声明）</h3>' + U.codeBlock(t.schema) +
      '<div class="divider"></div><h3 style="font-size:13px">被以下 Skill 引用</h3>' +
      (refSkills.length ? '<div class="list-plain">' + refSkills.map(function (k) {
        return '<div class="trace-row"><span class="ct ct-LLM">SKILL</span><span class="nd" style="white-space:normal">' + esc(k.id) + ' · ' + esc(k.name) + '</span><span class="lat">' + esc(k.subtask_id || '-') + '</span></div>';
      }).join('') + '</div>' : '<div class="small muted">暂无 Skill 引用（可在「配置态 · Skill 编写」中组合）</div>');
    U.openDrawer('Tool · ' + t.name, html);
  }

  /* ============================================================
   * 5. 规则管理 #/rules —— 关联探针 + 执行统计（扩展 v2 §3.5）
   * ============================================================ */
  function renderRules(el) {
    el.innerHTML =
      '<div class="section-title"><h2>规则管理</h2><span class="sub">规则 = 一等业务产出物（P3）· 展示关联探针、执行次数与成功率 · 运行态新探针动态并入</span><span class="mock-tag" style="margin-left:6px">MOCK 种子数据</span></div>' +
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>规则 ID</th><th>名称</th><th>维度</th><th>关联标准</th><th>表达式</th><th>状态</th><th>关联探针</th><th>执行次数</th><th>成功率</th><th>最近执行</th></tr></thead><tbody>' +
      S.rules.map(function (r) {
        var ps = S.associatedProbes(r.id);
        var chips = ps.slice(0, 3).map(function (p) { return '<span class="pill">' + esc(p.id) + ' · ' + p.type + '</span>'; }).join('') +
          (ps.length > 3 ? '<span class="pill">+' + (ps.length - 3) + '</span>' : '');
        return '<tr data-rule="' + r.id + '"' + (r.from_demo ? ' class="fresh"' : '') + '><td class="id">' + esc(r.id) + (r.from_demo ? ' <span class="badge b-amber">NEW</span>' : '') + '</td>' +
          '<td><b>' + esc(r.name) + '</b>' + (r.version === 'v1' && r.from_demo ? ' <span class="badge b-teal">发布生成</span>' : '') + '</td>' +
          '<td><span class="badge ' + (dimBadge[r.dimension] || 'b-dim') + '">' + esc(r.dimension) + '</span></td>' +
          '<td class="mono small">' + esc(r.standard_id) + '</td>' +
          '<td><code class="mono small">' + esc(r.expression) + '</code></td>' +
          '<td>' + ruleStatusBadge(r) + '</td>' +
          '<td><b class="mono" style="color:var(--teal)">' + ps.length + '</b><div class="pill-list" style="margin-top:4px">' + chips + '</div></td>' +
          '<td class="mono">' + r.exec_count + '</td>' +
          '<td style="min-width:130px">' + rateBar(r.success_rate) + '</td>' +
          '<td class="mono small muted">' + esc(r.last_run) + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<div class="small muted" style="margin-top:10px">提示：点击行查看「关联探针 / 执行统计 / 运行历史」。对话管理 Demo（探针生成）产出的 PRB-2001/PRB-2002 归属 RULE-0101 后，其关联探针数由 2 实时变为 4；Demo（规则生成）发布的 RULE-0107（生效）实时出现在此（监听 rules:changed）。</div>';

    U.$$('#view tr[data-rule]').forEach(function (tr) {
      tr.addEventListener('click', function () { openRuleDetail(tr.getAttribute('data-rule')); });
    });
  }

  function openRuleDetail(id) {
    var r = S.getRule(id); if (!r) return;
    var ps = S.associatedProbes(r.id);
    var std = S.standards.filter(function (x) { return x.id === r.standard_id; })[0];
    var html =
      '<div class="kv"><span class="k">规则 ID</span><b class="mono">' + esc(r.id) + '</b>' +
      '<span class="k">名称</span><b>' + esc(r.name) + '</b>' +
      '<span class="k">维度</span><span class="badge ' + (dimBadge[r.dimension] || 'b-dim') + '">' + esc(r.dimension) + '</span>' +
      '<span class="k">关联标准</span><span class="mono small">' + esc(r.standard_id) + (std ? ' · ' + esc(std.name) + '（' + esc(std.version) + '）' : '') + '</span>' +
      '<span class="k">表达式</span><code class="mono small">' + esc(r.expression) + '</code>' +
      '<span class="k">状态</span>' + ruleStatusBadge(r) + '</div>' +

      '<div class="divider"></div><h3 style="font-size:13px">关联探针 <span class="small muted" style="font-weight:400">（该规则关联了 ' + ps.length + ' 个探针 · 动态计算自规则库+产物库）</span><a href="#/probes" class="link-hint" style="float:right;font-size:11px">产物探针管理 &rarr;</a></h3>' +
      (ps.length ? '<div class="list-plain" data-nav="probes">' + ps.map(function (p) {
        return '<div class="trace-row probe-jump" data-probe="' + p.id + '"><span class="ct ' + (p.type === 'SQL' ? 'ct-TOOL' : 'ct-LLM') + '">' + p.type + '</span>' +
          '<span class="nd" style="white-space:normal">' + esc(p.id) + ' · ' + esc(p.name) + '</span>' +
          probeStatusBadge(p) + (freshProbeIds[p.id] ? '<span class="badge b-amber">本次生成</span>' : '') + '</div>';
      }).join('') + '</div>' : '<div class="small muted">暂无关联探针（可在运行态发起探针生成）</div>') +

      '<div class="divider"></div><h3 style="font-size:13px">执行统计 <span class="mock-tag" style="margin-left:4px">MOCK</span></h3>' +
      '<div class="stat-grid">' +
        '<div class="stat"><div class="v mono">' + r.exec_count + '</div><div class="l">总执行次数</div></div>' +
        '<div class="stat"><div class="v mono" style="color:var(--ok)">' + (r.success_count != null ? r.success_count : Math.round(r.exec_count * (r.success_rate || 0) / 100)) + '</div><div class="l">成功次数</div></div>' +
        '<div class="stat"><div class="v mono" style="color:var(--teal)">' + (r.success_rate != null ? r.success_rate + '%' : '—') + '</div><div class="l">成功率</div></div>' +
        '<div class="stat"><div class="v mono small" style="font-size:13px;line-height:2">' + esc(r.last_run || '—') + '</div><div class="l">最近执行</div></div>' +
      '</div>' +
      '<div style="margin-top:10px">' + rateBar(r.success_rate) + '</div>' +
      '<div class="divider"></div><h3 style="font-size:13px">最近 7 次趋势</h3><div class="small muted" style="margin-bottom:6px"><span class="tkey pass"></span>通过&nbsp;&nbsp;<span class="tkey fail"></span>未通过</div>' +
      trendBars(r.trend) +

      '<div class="divider"></div><h3 style="font-size:13px;margin-bottom:8px">运行历史 <span class="mock-tag">MOCK · MockScheduler.history()</span></h3><div id="rule-hist"><div class="running-note"><span class="spin"></span> 拉取中…</div></div>';
    U.openDrawer('规则 · ' + r.name, html);

    U.$$('.probe-jump', U.$('#dw-body')).forEach(function (row) {
      row.style.cursor = 'pointer';
      row.addEventListener('click', function () { U.closeDrawer(); R.go('probes'); });
    });
    M.MockScheduler.history(r.id).then(function (res) {
      var box = U.$('#rule-hist'); if (!box) return;
      box.innerHTML = res.data.map(function (h) {
        return '<div class="trace-row"><span class="ct ct-TOOL">RUN</span><span class="nd">' + h.run + ' · ' + h.at + '</span><span class="lat">' + h.cost + '</span><span class="st-ok" style="' + (h.status === 'FAIL' ? 'color:var(--danger)' : '') + '">' + h.status + '</span></div>' +
          (h.err ? '<div class="small muted" style="margin:2px 0 6px 4px">' + esc(h.err) + '</div>' : '');
      }).join('');
    });
  }

  /* ============================================================
   * 6. 产物探针管理 #/probes（替代旧业务资产混合表）
   * ============================================================ */
  function renderProbes(el) {
    var demoN = S.probes.filter(function (p) { return p.from_demo; }).length;
    el.innerHTML =
      '<div class="section-title"><h2>产物探针管理</h2><span class="sub">SQL / PYTHON 探针 = 可运行的一等业务产出物（P3）· 运行态新生成插入顶部并高亮</span></div>' +
      '<div class="tabs"><div class="tab on">全部探针<span class="cnt">' + S.probes.length + '</span></div><div class="tab" style="cursor:default">已调度<span class="cnt">' + S.probes.filter(function (p) { return p.status === 'SCHEDULED'; }).length + '</span></div><div class="tab" style="cursor:default">本次 Demo 生成<span class="cnt">' + demoN + '</span></div>' +
      '<a href="#/rules" class="btn btn-ghost small" style="margin-left:auto;padding:6px 12px;font-size:12px">规则管理 &rarr;</a></div>' +
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>探针 ID</th><th>名称</th><th>类型</th><th>关联规则</th><th>状态</th><th>数据源</th><th>执行次数</th><th>成功率</th><th>最近执行</th><th>调度</th><th>来源</th></tr></thead><tbody>' +
      S.probes.map(function (p) {
        return '<tr data-probe="' + p.id + '" class="' + (freshProbeIds[p.id] ? 'fresh' : '') + '">' +
          '<td class="id">' + esc(p.id) + (freshProbeIds[p.id] ? ' <span class="badge b-amber">NEW</span>' : '') + '</td>' +
          '<td><b>' + esc(p.name) + '</b></td>' +
          '<td>' + typeBadge(p.type) + '</td>' +
          '<td class="mono small rule-link">' + esc(p.rule_id || '-') + '</td>' +
          '<td>' + probeStatusBadge(p) + '</td>' +
          '<td class="mono small">' + esc(p.datasource_id || '-') + '</td>' +
          '<td class="mono">' + (p.exec_count != null ? p.exec_count : 0) + '</td>' +
          '<td>' + fmtRate(p.success_rate) + '</td>' +
          '<td class="mono small muted">' + esc(p.last_run || '—') + '</td>' +
          '<td class="mono small">' + (p.cron ? esc(p.cron) + '<span class="muted"> · ' + esc(p.cron_human || '') + '</span>' : '<span class="muted">—</span>') + '</td>' +
          '<td>' + (p.from_demo ? '<span class="badge b-amber">运行态生成</span>' : '<span class="muted small">种子</span>') + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<div class="small muted" style="margin-top:10px">提示：点击行查看探针代码、调度计划与运行历史；「关联规则」可跳转规则管理查看该规则的探针与执行统计。</div>';

    U.$$('#view tr[data-probe]').forEach(function (tr) {
      tr.addEventListener('click', function (e) {
        if (e.target.closest('.rule-link')) { U.closeDrawer(); R.go('rules'); return; }
        openProbeDetail(tr.getAttribute('data-probe'));
      });
    });
  }

  function openProbeDetail(id) {
    var p = S.getProbe(id); if (!p) return;
    var r = S.getRule(p.rule_id);
    var ds = S.datasources.filter(function (x) { return x.id === p.datasource_id; })[0];
    var html =
      '<div class="kv"><span class="k">探针 ID</span><b class="mono">' + esc(p.id) + '</b>' +
      '<span class="k">名称</span><b>' + esc(p.name) + '</b>' +
      '<span class="k">类型</span>' + typeBadge(p.type) +
      '<span class="k">状态</span>' + probeStatusBadge(p) +
      '<span class="k">关联规则</span><span class="mono small" style="color:var(--primary-2)">' + esc(p.rule_id || '-') + (r ? '<span class="muted"> · ' + esc(r.name) + '</span>' : '') + '</span>' +
      '<span class="k">数据源</span><span class="mono small">' + esc(p.datasource_id || '-') + (ds ? '<span class="muted"> · ' + esc(ds.name) + '（' + esc(ds.db_type) + '）</span>' : '') + '</span>' +
      '<span class="k">执行统计</span><span>共 <b class="mono">' + (p.exec_count != null ? p.exec_count : 0) + '</b> 次 · 成功率 ' + fmtRate(p.success_rate) + ' · 最近 ' + esc(p.last_run || '—') + '</span>' +
      '<span class="k">调度</span><span class="mono small">' + (p.cron ? esc(p.cron) + '（' + esc(p.cron_human || '') + '）' : '—') + '</span>' +
      (p.from_demo ? '<span class="k">来源</span><span class="badge b-amber">运行态 Demo 生成 · ' + esc(p.run_id || '') + '</span>' : '') + '</div>' +
      '<div class="divider"></div><h3 style="font-size:13px;margin-bottom:8px">探针代码</h3>' + U.codeBlock(p.code || '// 暂无代码') +
      (r ? '<div class="divider"></div><div class="small muted">该规则（' + esc(r.id) + '）当前共关联 <b style="color:var(--teal)">' + S.associatedProbes(r.id).length + '</b> 个探针，执行成功率 ' + (r.success_rate != null ? r.success_rate + '%' : '—') + '。<a href="#/rules" class="link-hint" style="margin-left:6px">规则管理 &rarr;</a></div>' : '') +
      '<div class="divider"></div><h3 style="font-size:13px;margin-bottom:8px">调度运行历史 <span class="mock-tag">MOCK</span></h3><div id="probe-hist"><div class="running-note"><span class="spin"></span> MockScheduler.history() 拉取中…</div></div>';
    U.openDrawer('探针 · ' + p.name, html);
    M.MockScheduler.history(p.id).then(function (res) {
      var box = U.$('#probe-hist'); if (!box) return;
      box.innerHTML = res.data.map(function (h) {
        return '<div class="trace-row"><span class="ct ct-TOOL">RUN</span><span class="nd">' + h.run + ' · ' + h.at + '</span><span class="lat">' + h.cost + '</span><span class="st-ok" style="' + (h.status === 'FAIL' ? 'color:var(--danger)' : '') + '">' + h.status + '</span></div>' +
          (h.err ? '<div class="small muted" style="margin:2px 0 6px 4px">' + esc(h.err) + '</div>' : '');
      }).join('');
    });
  }

  /* ---------- 实时事件：探针/规则变化时如在对应页则重绘 ---------- */
  S.on(function (evt) {
    var cur = R.current();
    if (evt === 'probes:changed' && cur === 'probes') renderProbes(U.$('#view'));
    if ((evt === 'probes:changed' || evt === 'rules:changed') && cur === 'rules') renderRules(U.$('#view'));
  });

  /* ---------- 路由注册（管理模块 6 条） ---------- */
  R.register('activities', { title: '业务活动管理', en: 'Business Activities · Orchestration', render: renderActivities });
  R.register('subtasks', { title: '子业务活动管理', en: 'Sub-activities · Goal / Skill / Gate', render: renderSubtasks });
  R.register('skills', { title: 'Skill 管理', en: 'Skill Packages · Progressive Disclosure', render: renderSkills });
  R.register('tools', { title: 'Tool 管理', en: 'Atomic Tools · Builtin / Registered', render: renderTools });
  R.register('rules', { title: '规则管理', en: 'Rules · Probe Association & Stats', render: renderRules });
  R.register('probes', { title: '产物探针管理', en: 'Probe Artifacts · SQL / PYTHON', render: renderProbes });

  console.log('%c[DQ-Prototype] manage.js 已加载：6 个管理视图注册（activities/subtasks/skills/tools/rules/probes）', 'color:#4f7cff;font-weight:bold;');
})(window);
