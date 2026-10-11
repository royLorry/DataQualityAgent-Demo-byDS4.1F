/* ============================================================
 * config.js — 配置态向导（Tool 注册 → Skill 编写 → 子业务活动配置 → 业务活动编排）
 * 主规范 §3.1 / §7 / §11 + 扩展 v2 §5 文案。资产编排链实时点亮。
 * 用户层面不出现「Agent/Task」字样：一律展示「业务活动」「子业务活动」。
 * ============================================================ */
(function (global) {
  'use strict';
  var S = global.DQState, U = global.DQUI, R = global.DQRouter;

  var wiz = {
    step: 1,
    builtinPicked: S.builtinTools.map(function (t) { return t.id; }), // 默认全选
    skillsSaved: 0,
    tasksSaved: 0
  };

  var STEPS = [
    { no: 1, t: 'Tool 注册', en: '注册内置/外接原子能力' },
    { no: 2, t: 'Skill 编写', en: '组合 Tool + Prompt 模板' },
    { no: 3, t: '子业务活动配置', en: '目标 · Skill · 知识白名单 · Gate' },
    { no: 4, t: '业务活动编排', en: '引用子业务活动 · 绑定知识 · 发布' }
  ];

  var KINDS = ['KNOWLEDGE', 'SQL', 'PYTHON', 'QUERY', 'IO'];
  var DISCLOSURE = [
    { v: 'L0', d: '元数据：仅 name/description，用于路由与选择' },
    { v: 'L1', d: '摘要：能力说明 + 所需 Tool 列表' },
    { v: 'L2', d: '完整：Prompt 模板 + Tool schema + 示例' }
  ];

  function kindBadge(k) {
    var m = { KNOWLEDGE: 'b-teal', SQL: 'b-blue', PYTHON: 'b-teal', QUERY: 'b-dim', IO: 'b-amber' };
    return '<span class="badge ' + (m[k] || 'b-dim') + '">' + k + '</span>';
  }

  /* ---------- 主渲染 ---------- */
  function renderConfig(el) {
    el.innerHTML =
      '<div class="section-title"><h2>配置态 · Config Workbench</h2><span class="sub">P1 业务活动用户自编排 —— 开租后数据源/知识体系已由本体服务自动加载（MOCK）</span></div>' +
      chainBar() + stepper() + '<div id="wiz-body"></div>';
    bindChrome(el);
    drawStep();
  }

  function chainBar() {
    function node(key, label) {
      return '<span class="chain-node' + (S.assetChain[key] ? ' lit' : '') + '" data-chain="' + key + '"><span class="bul"></span>' + label + '</span>';
    }
    function arr(key) {
      return '<span class="chain-arrow' + (S.assetChain[key] ? ' lit' : '') + '" data-arr="' + key + '">&rarr;</span>';
    }
    return '<div class="chain-bar"><b style="font-size:12px;color:var(--text-dim);letter-spacing:.5px">资产编排链</b>' +
      node('tool', 'Tool 注册') + arr('tool') + node('skill', 'Skill 编写') + arr('skill') +
      node('task', '子业务活动配置') + arr('task') + node('agent', '业务活动编排 · 发布') +
      '<span style="margin-left:auto;font-family:var(--mono);font-size:11px;color:var(--text-dim)">' +
      (S.assetChain.agent ? '业务活动已发布，可进入运行态' : '完成 4 步后业务活动状态置「已发布」') + '</span></div>';
  }

  function stepper() {
    var html = '<div class="stepper">';
    STEPS.forEach(function (st, i) {
      var cls = wiz.step === st.no ? 'active' : (wiz.step > st.no ? 'done' : '');
      html += '<div class="step ' + cls + '" data-step="' + st.no + '"><div class="no">' + (wiz.step > st.no ? '&#10003;' : st.no) + '</div><div class="tt">' + st.t + '<small>' + st.en + '</small></div></div>';
      if (i < STEPS.length - 1) html += '<div class="step-line' + (wiz.step > st.no ? ' fill' : '') + '"><i></i></div>';
    });
    return html + '</div>';
  }

  function bindChrome(el) {
    U.$$('#view .step', el).forEach(function (s) {
      s.addEventListener('click', function () {
        wiz.step = parseInt(s.getAttribute('data-step'), 10);
        renderConfig(U.$('#view'));
      });
    });
  }

  function refreshChrome() {
    var el = U.$('#view');
    U.$$('#view .chain-bar', el).forEach(function (b) { b.outerHTML = chainBar(); });
    U.$$('#view .stepper', el).forEach(function (b) { b.outerHTML = stepper(); });
    bindChrome(el);
  }

  function drawStep() {
    var host = U.$('#wiz-body');
    host.innerHTML = '';
    if (wiz.step === 1) stepTool(host);
    else if (wiz.step === 2) stepSkill(host);
    else if (wiz.step === 3) stepTask(host);
    else stepAgent(host);
  }

  function stepShell(title, sub, inner, nextLabel, nextFn) {
    var host = U.$('#wiz-body');
    host.innerHTML = '<div class="grid" style="grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);align-items:start;gap:14px"><div id="wiz-main">' + inner + '</div><div id="wiz-side"></div></div>';
    if (nextFn) {
      var bar = document.createElement('div');
      bar.style.cssText = 'display:flex;gap:10px;margin-top:14px;align-items:center';
      bar.innerHTML = '<button class="btn btn-primary" id="wiz-next">' + nextLabel + '</button><span class="small muted">' + title + ' · ' + sub + '</span>';
      U.$('#wiz-main').appendChild(bar);
      U.$('#wiz-next').addEventListener('click', nextFn);
    }
  }

  /* ---------- Step 1 · Tool 注册 ---------- */
  function stepTool(host) {
    var inner =
      '<div class="card"><h3><span class="bar"></span>内置 Tool（平台随租户开租注入 · spec §7.2）</h3>' +
      '<div class="checks" id="builtin-list" style="gap:8px">' +
      S.builtinTools.map(function (t) {
        var on = wiz.builtinPicked.indexOf(t.id) >= 0;
        return '<label class="chk' + (on ? ' on' : '') + '" data-bid="' + t.id + '" title="' + U.esc(t.desc) + '"><input type="checkbox" ' + (on ? 'checked' : '') + '><span class="mono" style="font-size:11.5px">' + t.name + '</span>' + kindBadge(t.kind) + '</label>';
      }).join('') + '</div>' +
      '<div class="divider"></div>' +
      '<h3><span class="bar"></span>开放注册 Tool（OpenAPI/Schema → tool.register 网关）</h3>' +
      '<div class="grid" style="grid-template-columns:1fr 1fr">' +
        '<div class="field" style="margin:0"><label>Tool 名称（如 alert.push）</label><input class="input mono" id="rt-name" placeholder="alert.push"></div>' +
        '<div class="field" style="margin:0"><label>kind 类别</label><select class="input" id="rt-kind">' + KINDS.map(function (k) { return '<option>' + k + '</option>'; }).join('') + '</select></div>' +
      '</div>' +
      '<div class="field" style="margin-top:12px"><label>schema JSON（入参/出参声明）</label><textarea class="input" id="rt-schema" rows="4" placeholder=\'{"input":{"channel":"string","msg":"string"},"output":{"msg_id":"string"}}\'>{"input":{"probe_id":"string","level":"string"},"output":{"alert_id":"string"}}</textarea></div>' +
      '<div id="rt-err" class="small" style="color:var(--danger);min-height:18px;margin-bottom:8px"></div>' +
      '<button class="btn btn-teal" id="rt-reg">注册自定义 Tool</button>' +
      '</div>';

    stepShell('Step 1', '注册原子能力，供 Skill 组合引用', inner, '完成注册，下一步：Skill 编写 &rarr;', function () {
      if (!S.assetChain.tool) S.assetChain.tool = true;
      wiz.step = 2; renderConfig(U.$('#view'));
    });

    U.$('#builtin-list').addEventListener('change', function (e) {
      var lb = e.target.closest('.chk'); if (!lb) return;
      var id = lb.getAttribute('data-bid');
      var i = wiz.builtinPicked.indexOf(id);
      if (e.target.checked && i < 0) wiz.builtinPicked.push(id);
      if (!e.target.checked && i >= 0) wiz.builtinPicked.splice(i, 1);
      lb.classList.toggle('on', e.target.checked);
      drawRegisteredPanel();
    });

    U.$('#rt-reg').addEventListener('click', function () {
      var name = U.$('#rt-name').value.trim();
      var kind = U.$('#rt-kind').value;
      var schema = U.$('#rt-schema').value.trim();
      var err = U.$('#rt-err');
      if (!name) { err.textContent = 'Tool 名称不能为空'; return; }
      if (!/^[a-z0-9_.-]+$/i.test(name)) { err.textContent = '名称仅允许字母/数字/._-'; return; }
      try { JSON.parse(schema || '{}'); } catch (ex) { err.textContent = 'schema 不是合法 JSON：' + ex.message; return; }
      err.textContent = '';
      S.countRegisteredTool({ id: 'tool-reg-' + S.registeredTools.length, name: name, kind: kind, category: 'REGISTERED', desc: '用户开放注册（含鉴权/限流/版本，演示省略）', schema: schema });
      console.log('%c[DQ-Prototype] Tool 已注册: ' + name + '（category=REGISTERED）', 'color:#2dd4bf');
      U.$('#rt-name').value = '';
      drawRegisteredPanel();
      refreshChrome();
    });

    drawRegisteredPanel();
  }

  function drawRegisteredPanel() {
    var side = U.$('#wiz-side');
    if (!side) return;
    var picked = wiz.builtinPicked.length;
    side.innerHTML =
      '<div class="card"><h3><span class="bar"></span>已登记 Tool 清单</h3>' +
      '<div class="small muted" style="margin-bottom:8px">内置勾选 <b style="color:var(--teal)">' + picked + '</b> / ' + S.builtinTools.length + ' · 开放注册 <b style="color:var(--amber)">' + S.registeredTools.length + '</b></div>' +
      '<div class="list-plain" style="max-height:430px;overflow:auto">' +
      S.builtinTools.filter(function (t) { return wiz.builtinPicked.indexOf(t.id) >= 0; }).concat(S.registeredTools).map(function (t) {
        var isReg = t.category === 'REGISTERED';
        return '<div class="trace-row"><span class="ct ' + (isReg ? 'ct-LLM' : 'ct-TOOL') + '">' + (isReg ? 'REG' : 'BUILTIN') + '</span><span class="nd">' + U.esc(t.name) + '</span><span class="lat">' + t.kind + '</span></div>';
      }).join('') + '</div></div>';
  }

  /* ---------- Step 2 · Skill 编写 ---------- */
  function stepSkill(host) {
    var inner =
      '<div class="card"><h3><span class="bar"></span>新建 Skill（能力包 = 多个 Tool + Prompt 模板）</h3>' +
      '<div class="grid" style="grid-template-columns:1fr 1fr">' +
        '<div class="field" style="margin:0"><label>Skill 名称</label><input class="input" id="sk-name" placeholder="探针落库审核包" value="探针生成包"></div>' +
        '<div class="field" style="margin:0"><label>子业务活动上下文（选择/新建）</label><input class="input" id="sk-task" list="task-options" value="SU-101 · 本体探查"><datalist id="task-options">' + S.subtasks.map(function (t) { return '<option value="' + U.esc(t.id + ' · ' + t.name) + '">'; }).join('') + '</datalist></div>' +
      '</div>' +
      '<div class="field" style="margin-top:12px"><label>从已登记 Tool 中组合（Step1 产出）</label><div class="checks" id="sk-tools">' +
        S.allTools().map(function (t, i) {
          var def = ['ontology.lookup', 'lineage.query', 'sql.execute', 'python.run', 'knowledge.load'].indexOf(t.name) >= 0;
          return '<label class="chk' + (def ? ' on' : '') + '"><input type="checkbox" ' + (def ? 'checked' : '') + ' value="' + U.esc(t.name) + '"><span class="mono" style="font-size:11.5px">' + U.esc(t.name) + '</span></label>';
        }).join('') +
      '</div></div>' +
      '<div class="field"><label>Prompt 模板</label><textarea class="input" id="sk-prompt" rows="5">你是数据质量探针工程师。依据规则口径与本体/血缘结果，生成可运行 SQL/Python 探针；先 sql.execute / python.run 试运行，通过后经 probe.upsert 落库。</textarea></div>' +
      '<div class="field"><label>渐进披露层级（spec §7.1：默认注入 L0，命中后逐级展开）</label><div class="checks" id="sk-disc">' +
        DISCLOSURE.map(function (d) {
          return '<span class="chip-radio' + (d.v === 'L1' ? ' on' : '') + '" data-v="' + d.v + '" title="' + U.esc(d.d) + '">' + d.v + '</span>';
        }).join('') + '<span class="small muted" id="sk-disc-desc" style="align-self:center;margin-left:6px">' + U.esc(DISCLOSURE[1].d) + '</span></div></div>' +
      '<button class="btn btn-primary" id="sk-save">保存 Skill</button><span id="sk-msg" class="small" style="margin-left:10px;color:var(--ok)"></span>' +
      '</div>';

    stepShell('Step 2', '组合能力包并配置渐进披露', inner, '下一步：子业务活动配置 &rarr;', function () {
      wiz.step = 3; renderConfig(U.$('#view'));
    });

    U.$$('#sk-tools .chk input').forEach(function (cb) {
      cb.addEventListener('change', function () { cb.closest('.chk').classList.toggle('on', cb.checked); });
    });
    U.$$('#sk-disc .chip-radio').forEach(function (c) {
      c.addEventListener('click', function () {
        U.$$('#sk-disc .chip-radio').forEach(function (x) { x.classList.toggle('on', x === c); });
        var d = DISCLOSURE.filter(function (x) { return x.v === c.getAttribute('data-v'); })[0];
        U.$('#sk-disc-desc').textContent = d.d;
      });
    });
    U.$('#sk-save').addEventListener('click', function () {
      var name = U.$('#sk-name').value.trim();
      if (!name) { U.$('#sk-msg').style.color = 'var(--danger)'; U.$('#sk-msg').textContent = 'Skill 名称不能为空'; return; }
      var tools = U.$$('#sk-tools input:checked').map(function (c) { return c.value; });
      var disc = (U.$('#sk-disc .chip-radio.on') || {}).getAttribute ? U.$('#sk-disc .chip-radio.on').getAttribute('data-v') : 'L1';
      S.countSkill({
        id: 'SK-' + String(S.skills.length + 1).padStart(2, '0'),
        subtask_id: U.$('#sk-task').value.split(' · ')[0],
        name: name, disclosure: disc, tools: tools,
        prompt: U.$('#sk-prompt').value.trim(), created_by_user: true
      });
      wiz.skillsSaved++;
      U.$('#sk-msg').style.color = 'var(--ok)';
      U.$('#sk-msg').textContent = '已保存并注入 Skill 清单';
      drawSkillPanel(); refreshChrome();
    });
    drawSkillPanel();
  }

  function drawSkillPanel() {
    var side = U.$('#wiz-side'); if (!side) return;
    side.innerHTML = '<div class="card"><h3><span class="bar"></span>Skill 清单</h3><div class="list-plain">' +
      S.skills.map(function (k) {
        return '<div class="kn-card' + (k.created_by_user ? ' done' : '') + '"><div class="k-t">' + U.esc(k.name) + '<span class="badge b-blue">' + k.disclosure + '</span>' + (k.created_by_user ? '<span class="badge b-teal">新</span>' : '') + '</div>' +
          '<div class="pill-list">' + k.tools.map(function (t) { return '<span class="pill">' + U.esc(t) + '</span>'; }).join('') + '</div>' +
          '<div class="k-meta"><span>子业务活动: <b>' + U.esc(k.subtask_id || '-') + '</b></span><span class="snippet">' + U.esc(k.prompt.slice(0, 64)) + '…</span></div></div>';
      }).join('') + '</div></div>';
  }

  /* ---------- Step 3 · Task 配置 ---------- */
  var KN_GROUPS = [
    { v: 'KN-01', label: '本体' }, { v: 'KN-02', label: '血缘' }, { v: 'KN-03', label: '规则' },
    { v: 'KN-04', label: '标准' }, { v: 'KN-05', label: '文档' }
  ];

  function stepTask(host) {
    var inner =
      '<div class="card"><h3><span class="bar"></span>新建子业务活动</h3>' +
      '<div class="grid" style="grid-template-columns:1fr 1fr">' +
        '<div class="field" style="margin:0"><label>子业务活动名称</label><input class="input" id="tk-name" value="探针生成与落库（新）" placeholder="如 探针生成与落库"></div>' +
        '<div class="field" style="margin:0"><label>目标 goal</label><input class="input" id="tk-goal" value="按规则生成可运行探针并经 HITL 审核落库"></div>' +
      '</div>' +
      '<div class="field" style="margin-top:12px"><label>绑定 Skill（Step2 产出）</label><div class="checks" id="tk-skills">' +
        S.skills.map(function (k, i) {
          return '<label class="chk' + (i < 2 ? ' on' : '') + '"><input type="checkbox" value="' + k.id + '" ' + (i < 2 ? 'checked' : '') + '><span class="mono" style="font-size:11.5px">' + k.id + '</span> ' + U.esc(k.name) + '</label>';
        }).join('') + '</div></div>' +
      '<div class="field"><label>知识白名单（P5：Planner 规划期按白名单加载；无权限不进候选池）</label><div class="checks" id="tk-kn">' +
        KN_GROUPS.map(function (g) {
          var kn = S.knowledge.filter(function (x) { return x.id === g.v; })[0];
          return '<label class="chk' + (['KN-01', 'KN-02', 'KN-03'].indexOf(g.v) >= 0 ? ' on' : '') + '"><input type="checkbox" value="' + g.v + '" ' + (['KN-01', 'KN-02', 'KN-03'].indexOf(g.v) >= 0 ? 'checked' : '') + '><b>' + g.label + '</b><span class="small muted mono">' + kn.permission_tag + '</span></label>';
        }).join('') + '</div></div>' +
      '<div class="field"><label>Gate 判定策略</label><div class="checks" id="tk-gate">' +
        ['LLM', 'HUMAN', 'BOTH'].map(function (p, i) {
          return '<span class="chip-radio' + (i === 2 ? ' on' : '') + '" data-v="' + p + '">' + p + (p === 'LLM' ? ' 判断' : p === 'HUMAN' ? ' 人工确认' : ' 双判') + '</span>';
        }).join('') + '<span class="small muted" style="align-self:center;margin-left:8px">子活动结束时执行 Gate 判定；HUMAN/BOTH 触发 HITL 中断</span></div></div>' +
      '<button class="btn btn-primary" id="tk-save">保存子业务活动</button><span id="tk-msg" class="small" style="margin-left:10px;color:var(--ok)"></span>' +
      '</div>';

    stepShell('Step 3', '绑定 Skill 与知识白名单、设定 Gate 策略', inner, '下一步：业务活动编排 &rarr;', function () {
      wiz.step = 4; renderConfig(U.$('#view'));
    });

    [['#tk-skills'], ['#tk-kn']].forEach(function (sel) {
      U.$$('input', U.$(sel[0])).forEach(function (cb) {
        cb.addEventListener('change', function () { cb.closest('.chk').classList.toggle('on', cb.checked); });
      });
    });
    U.$$('#tk-gate .chip-radio').forEach(function (c) {
      c.addEventListener('click', function () {
        U.$$('#tk-gate .chip-radio').forEach(function (x) { x.classList.remove('on'); });
        c.classList.add('on');
      });
    });
    U.$('#tk-save').addEventListener('click', function () {
      var name = U.$('#tk-name').value.trim();
      if (!name) { U.$('#tk-msg').style.color = 'var(--danger)'; U.$('#tk-msg').textContent = '名称不能为空'; return; }
      var gate = (U.$('#tk-gate .chip-radio.on') || {}).getAttribute ? U.$('#tk-gate .chip-radio.on').getAttribute('data-v') : 'BOTH';
      S.countTask({
        id: 'SU-' + String(S.subtasks.length + 1).padStart(3, '0'),
        ba_id: '', name: name, goal: U.$('#tk-goal').value.trim(), order_index: S.subtasks.length + 1,
        skill_ids: U.$$('#tk-skills input:checked').map(function (c) { return c.value; }),
        knowledge_ids: U.$$('#tk-kn input:checked').map(function (c) { return c.value; }),
        gate_policy: gate, created_by_user: true
      });
      wiz.tasksSaved++;
      U.$('#tk-msg').textContent = '已保存子业务活动（gate=' + gate + '）';
      drawTaskPanel(); refreshChrome();
    });
    drawTaskPanel();
  }

  function drawTaskPanel() {
    var side = U.$('#wiz-side'); if (!side) return;
    var gateB = { LLM: 'b-teal', HUMAN: 'b-amber', BOTH: 'b-amber' };
    side.innerHTML = '<div class="card"><h3><span class="bar"></span>子业务活动清单</h3><div class="list-plain">' +
      S.subtasks.map(function (t) {
        return '<div class="kn-card' + (t.created_by_user ? ' done' : '') + '"><div class="k-t">' + U.esc(t.name) + '<span class="badge ' + (gateB[t.gate_policy] || 'b-dim') + '">Gate ' + t.gate_policy + '</span>' + (t.created_by_user ? '<span class="badge b-teal">新</span>' : '') + '</div>' +
          '<div class="small snippet muted">' + U.esc(t.goal) + '</div>' +
          '<div class="k-meta"><span>Skill: <b>' + (t.skill_ids.join(', ') || '-') + '</b></span><span>知识白名单: <b>' + (t.knowledge_ids.join(', ') || '-') + '</b></span></div></div>';
      }).join('') + '</div></div>';
  }

  /* ---------- Step 4 · 业务活动编排 + 发布 ---------- */
  function stepAgent(host) {
    var inner =
      '<div class="card"><h3><span class="bar"></span>编排业务活动并发布</h3>' +
      '<div class="grid" style="grid-template-columns:1fr 1fr">' +
        '<div class="field" style="margin:0"><label>业务活动名称</label><input class="input" id="ag-name" value="探针生成业务活动 · 演示新编排"></div>' +
        '<div class="field" style="margin:0"><label>业务活动（对齐管理模块样例）</label><select class="input" id="ag-ba">' +
          S.businessActivities.map(function (b) { return '<option value="' + b.id + ' · ' + U.esc(b.name) + '">' + b.id + ' · ' + U.esc(b.name) + '</option>'; }).join('') + '</select></div>' +
      '</div>' +
      '<div class="field" style="margin-top:12px"><label>描述</label><input class="input" id="ag-desc" value="自然语言需求 → 探针生成 → HITL 审核 → 调度闭环"></div>' +
      '<div class="field"><label>引用子业务活动（Step3 产出，1:N）</label><div class="checks" id="ag-tasks">' +
        S.subtasks.map(function (t, i) {
          return '<label class="chk' + (i < 4 ? ' on' : '') + '"><input type="checkbox" value="' + t.id + '" ' + (i < 4 ? 'checked' : '') + '><span class="mono" style="font-size:11.5px">' + t.id + '</span> ' + U.esc(t.name) + '</label>';
        }).join('') + '</div></div>' +
      '<div class="field"><label>绑定知识（业务活动级白名单）</label><div class="checks" id="ag-kn">' +
        S.knowledge.map(function (k, i) {
          var on = k.id !== 'KN-05';
          return '<label class="chk' + (on ? ' on' : '') + '"><input type="checkbox" value="' + k.id + '" ' + (on ? 'checked' : '') + '><b>' + U.esc(k.name) + '</b><span class="small muted">' + k.scope + '</span></label>';
        }).join('') + '</div></div>' +
      '<button class="btn btn-teal btn-lg" id="ag-publish">发布业务活动</button>' +
      '<span id="ag-msg" class="small" style="margin-left:10px;color:var(--ok)"></span>' +
      '</div>';

    stepShell('Step 4', '业务活动引用子业务活动、绑定知识，发布为可运行业务旅程', inner, null, null);

    U.$$('#ag-tasks input, #ag-kn input').forEach(function (cb) {
      cb.addEventListener('change', function () { cb.closest('.chk').classList.toggle('on', cb.checked); });
    });
    U.$('#ag-publish').addEventListener('click', function () {
      var name = U.$('#ag-name').value.trim();
      if (!name) { U.$('#ag-msg').style.color = 'var(--danger)'; U.$('#ag-msg').textContent = '业务活动名称不能为空'; return; }
      var tasks = U.$$('#ag-tasks input:checked').map(function (c) { return c.value; });
      if (!tasks.length) { U.$('#ag-msg').style.color = 'var(--danger)'; U.$('#ag-msg').textContent = '至少引用一个子业务活动'; return; }
      S.publishAgent({
        id: 'BA-' + String(S.businessActivities.length + 1).padStart(2, '0'),
        name: name, description: U.$('#ag-desc').value.trim(),
        business_activity: U.$('#ag-ba').value,
        task_ids: tasks,
        knowledge_ids: U.$$('#ag-kn input:checked').map(function (c) { return c.value; }),
        created_by: '业务人员', created_at: '2026-10-11', created_by_user: true
      });
      U.$('#ag-msg').textContent = '发布成功 · 状态「已发布」';
      refreshChrome();
      var badge = U.$('#agent-badge');
      if (badge) { badge.textContent = '业务活动: ' + name + ' · 已发布'; badge.classList.add('flash-ok'); }
      U.$('#wiz-main').classList.add('flash-ok');
      var go = document.createElement('button');
      go.className = 'btn btn-primary'; go.style.marginLeft = '10px';
      go.innerHTML = '&#9654; 立即发起运行态需求';
      go.addEventListener('click', function () { S.pendingDemo = 'A'; R.go('chat'); });
      U.$('#ag-publish').parentNode.insertBefore(go, U.$('#ag-msg'));
    });
    drawAgentPanel();
  }

  function drawAgentPanel() {
    var side = U.$('#wiz-side'); if (!side) return;
    side.innerHTML = '<div class="card"><h3><span class="bar"></span>业务活动清单</h3><div class="list-plain">' +
      S.businessActivities.map(function (a) {
        var subIds = a.subtask_ids || a.task_ids || [];
        return '<div class="kn-card' + (a.created_by_user ? ' done' : '') + '"><div class="k-t">' + U.esc(a.name) +
          '<span class="badge ' + (a.status === 'PUBLISHED' ? 'b-ok' : 'b-dim') + '">' + (a.status === 'PUBLISHED' ? '已发布' : '草稿') + '</span></div>' +
          '<div class="small snippet muted">' + U.esc(a.description || a.business_activity || '') + '</div>' +
          '<div class="k-meta"><span>子业务活动: <b>' + subIds.join(', ') + '</b></span><span>知识: <b>' + (a.knowledge_ids || []).join(', ') + '</b></span></div></div>';
      }).join('') + '</div>' +
      '<div class="divider"></div><div class="small muted">配置态完成标志：业务活动状态 = <b style="color:var(--ok)">已发布</b>，即可在运行态被自然语言触发。</div></div>';
  }

  /* 监听资产变化：右侧清单在页时同步 */
  S.on(function (evt) {
    if (R.current() !== 'config') return;
    if (evt === 'tools:changed') drawRegisteredPanel();
    if (evt === 'skills:changed') drawSkillPanel();
    if (evt === 'tasks:changed') drawTaskPanel();
    if (evt === 'agents:changed') drawAgentPanel();
  });

  R.register('config', { title: '配置态', en: 'Config Workbench · 4 步向导', render: renderConfig });
  global.DQConfig = { render: renderConfig };
  console.log('%c[DQ-Prototype] config.js 已加载：配置态向导注册', 'color:#4f7cff;font-weight:bold;');
})(window);
