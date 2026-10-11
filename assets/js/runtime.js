/* ============================================================
 * runtime.js — 对话管理（#/chat）：对话即运行态（扩展 v3 §2/§3/§4）
 * 三列布局：会话列表(≈240px) | 对话线程（内联动画管线） | 主管线状态 + Trace(≈360px)
 * 主链路：用户发起需求 → 三层路由(状态→意图→业务活动路由，命中意图可见)
 *   → 知识加载 → 规划子业务活动(DAG) → 执行(ReAct) → 每个子活动 Gate 判定均为「人工确认 HITL」→ Finish
 * 演示模式（扩展 v4 §3）：Demo.mode = 'auto'（一键全自动：每个 Gate 短暂展示后自动确认）
 *   | 'manual'（手工逐步：每个子活动 Gate 处 interrupt() 挂起，等待 通过/驳回/修改）
 * 意图路由（对话内显式展示「命中意图 → 路由至业务活动「×××」」）：
 *   探针/校验/落库/调度 → 探针生成业务活动 (BA-01 · DQProbeGenerationDAG · 4 子活动) → PRB-2001/2002 归 RULE-0101（关联 2→4）
 *   规则/标准/发布     → 规则生成业务活动 (BA-02 · DQRuleGenerationDAG · 5 子活动) → RULE-0107 发布「生效」→ #/rules
 * 保留 API：DQRuntime = { render, Demo, startRun }；Demo.running 供 app.js 导航徽章。
 * ============================================================ */
(function (global) {
  'use strict';
  var S = global.DQState, M = global.DQMock, U = global.DQUI, R = global.DQRouter;
  var esc = U.esc, sleep = U.sleep;

  var Demo = {
    running: false,
    aborted: false,
    mode: 'auto',          /* 演示模式（扩展 v4 §3）：'auto' 一键全自动 · 'manual' 手工逐步 */
    waitingHitl: false,    /* 手工模式下 Gate 挂起等待态（可检测：右栏 Gate 节点 WAIT + 决策未回） */
    hitlResolver: null,
    genProbes: { sql: null, py: null },
    genRule: null,
    schedule: null,
    convId: null,
    autoStick: true        /* 演示时对话自动下滑（用户手动上滑则暂停，重新发起时恢复）*/
  };

  var selConv = null; /* 当前选中会话 id */

  function nowStr() { return new Date().toLocaleTimeString('zh-CN', { hour12: false }); }
  function convById(id) { return S.conversations.filter(function (c) { return c.id === id; })[0] || null; }
  function convForRequest(text) {
    return S.conversations.filter(function (c) { return c.request === text; })[0] || null;
  }
  function intentLabel(it) {
    if (it === 'RUN_PROBE_REQUEST') return '探针生成';
    if (it === 'RUN_RULE_REQUEST') return '规则生成';
    if (it === 'FOLLOW_UP') return '待澄清';
    return it || '待开始';
  }
  function statusBadge(st) {
    var cls = st === '运行中' ? 'b-teal' : st === '已完成' ? 'b-ok' : st === '已驳回' ? 'b-danger' : 'b-dim';
    return '<span class="badge ' + cls + '" style="font-size:10px">' + esc(st) + '</span>';
  }

  /* ---------- 视图骨架：三列（会话列表 | 对话线程 | 管线+Trace） ---------- */
  function renderChat(el) {
    el.innerHTML =
      '<div class="section-title"><h2>对话管理</h2><span class="sub">对话即运行态 · 命中意图 &rarr; 路由至业务活动 · 管线内联展开 + HITL + 实时 Trace</span></div>' +
      '<div class="ck-grid">' +

        /* 左列：会话列表 */
        '<div class="ck-conv">' +
          '<button class="btn btn-primary small" id="btn-new-conv" style="width:100%">&#65291; 新建对话</button>' +
          '<div class="conv-list" id="conv-list"></div>' +
        '</div>' +

        /* 中列：对话线程（工具条 + 消息流 + 输入框） */
        '<div class="ck-thread">' +
          '<div class="card ck-toolbar-card">' +
            '<div class="ck-toolbar">' +
              '<button class="btn btn-teal small" id="btn-demo-probe">&#9654;&nbsp; Demo：探针生成</button>' +
              '<button class="btn btn-amber small" id="btn-demo-rule">&#9654;&nbsp; Demo：规则生成</button>' +
              '<span class="mode-seg-label">演示模式：</span>' +
              '<span class="mode-seg" id="demo-mode-seg">' +
                '<button class="mode-seg-btn" data-mode="auto" id="btn-mode-auto">&#9679;&nbsp; 一键全自动</button>' +
                '<button class="mode-seg-btn" data-mode="manual" id="btn-mode-manual">&#9675;&nbsp; 手工逐步</button>' +
              '</span>' +
              '<span class="mock-tag" style="margin-left:auto">外部系统 MOCK</span>' +
              '<button class="btn btn-ghost small" id="btn-reset" style="padding:6px 12px;font-size:12px">重置画面</button>' +
            '</div>' +
            '<div class="small muted" style="margin-top:8px">意图路由：探针 / 校验 / 落库 / 调度 &rarr; 「探针生成业务活动」(BA-01) · 规则 / 标准 / 发布 &rarr; 「规则生成业务活动」(BA-02)</div>' +
            '<div class="small muted" style="margin-top:4px">演示模式：全自动 = 每个 Gate 自动确认，零手动跑到 Finish；手工逐步 = 每个子活动 Gate 由人工点击 通过/驳回/修改 逐步推进。</div>' +
          '</div>' +
          '<div class="card ck-chat-card" id="chat-card">' +
            '<div id="chat-stream" style="display:flex;flex-direction:column;gap:10px"></div>' +
            '<div class="divider"></div>' +
            '<div class="chat-box">' +
              '<textarea class="input" id="chat-input" rows="2" placeholder="输入数据质量诉求（探针/校验/调度 → 探针生成 · 规则/标准/发布 → 规则生成）…"></textarea>' +
              '<button class="btn btn-primary" id="btn-send">发送</button>' +
            '</div>' +
          '</div>' +
        '</div>' +

        /* 右列：主管线状态 + Trace 面板（实时写入） */
        '<div class="ck-rail">' +
          '<div class="card"><h3><span class="bar"></span>主管线状态</h3><div class="pipe-mini" id="pipe-mini"></div></div>' +
          '<div class="card"><div class="tp-head"><h3 style="margin:0"><span class="bar"></span>子业务活动进展</h3><span class="badge b-dim mono" id="sp-count">待规划</span></div><div class="sp-list" id="sp-list"><div class="sp-empty">规划子活动完成后，在此显示子业务活动列表与进展</div></div></div>' +
          '<div class="card trace-panel"><div class="tp-head"><h3 style="margin:0"><span class="bar"></span>Trace 面板</h3><span class="badge b-dim mono" id="trace-count">0 步</span><span class="mock-tag" style="margin-left:auto">LIVE</span></div><div class="trace-list" id="trace-live"><div class="trace-empty">运行后实时写入每个 LLM / Tool 调用</div></div><div class="small muted" style="margin-top:8px"><a href="#/trace" style="color:var(--primary-2)">打开完整链路追踪页 &rarr;</a></div></div>' +
        '</div>' +
      '</div>';

    /* 事件绑定 */
    U.$('#btn-send').addEventListener('click', function () {
      var c = convById(selConv);
      var t = U.$('#chat-input').value.trim() || (c && c.request) || S.demoRequest;
      startRun(t);
    });
    U.$('#chat-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); U.$('#btn-send').click(); }
    });
    U.$('#btn-demo-probe').addEventListener('click', function () { runDemo('A'); });
    U.$('#btn-demo-rule').addEventListener('click', function () { runDemo('B'); });
    U.$('#btn-new-conv').addEventListener('click', newConversation);
    U.$$('#demo-mode-seg .mode-seg-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        if (Demo.running) { flashBusy(); return; }
        var m = b.getAttribute('data-mode');
        if (m !== Demo.mode) setDemoMode(m, true);
      });
    });
    setDemoMode(Demo.mode, false); /* 重渲染后恢复高亮 */
    if (Demo.running) disableInputs(true);
    U.$('#btn-reset').addEventListener('click', function () {
      if (Demo.running) { flashBusy(); return; }
      resetBoard(false);
      chatBubble('画面已重置 · 选择左侧会话或直接输入需求重新发起。', true);
    });

    buildPipeMini();
    bindTraceLive();
    bindAutoScroll();
    drawConvList();

    /* 默认选中第一条会话并预填请求 */
    var first = S.conversations[0];
    if (first) {
      selConv = first.id;
      U.$('#chat-input').value = first.request || '';
      drawConvList();
      chatBubble('会话「' + esc(first.title) + '」已加载 · 意图 ' + intentLabel(first.intent) + ' · 点击「发送」或 Demo 按钮发起运行。', true);
    }

    /* dashboard / 配置向导跳转自动开播 */
    if (S.pendingDemo) {
      var which = S.pendingDemo; S.pendingDemo = false;
      var txt = which === 'B' ? S.demoRules : S.demoRequest;
      setTimeout(function () {
        var c = convForRequest(txt);
        if (c) { selConv = c.id; drawConvList(); }
        U.$('#chat-input').value = txt;
        startRun(txt);
      }, 450);
    }
  }

  function runDemo(which) {
    if (Demo.running) { flashBusy(); return; }
    var txt = which === 'B' ? S.demoRules : S.demoRequest;
    var c = convForRequest(txt);
    if (c) { selConv = c.id; drawConvList(); }
    U.$('#chat-input').value = txt;
    startRun(txt);
  }

  /* 演示模式切换（扩展 v4 §3）：'auto' 一键全自动 · 'manual' 手工逐步；运行期间按钮禁用 */
  function setDemoMode(mode, announce) {
    Demo.mode = mode === 'manual' ? 'manual' : 'auto';
    U.$$('#demo-mode-seg .mode-seg-btn').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-mode') === Demo.mode);
    });
    if (announce) {
      chatBubble(Demo.mode === 'auto'
        ? '已切换到<b style="color:var(--teal)">一键全自动</b>演示模式：点击 Demo 后零手动操作，每个子业务活动 Gate 卡展示后自动确认（约 0.7s），流程自动跑到 Finish。'
        : '已切换到<b style="color:var(--amber)">手工逐步</b>演示模式：流程将在<b>每个子业务活动 Gate（人工确认 HITL）</b>处中断挂起，由业务人员点击「通过 / 驳回 / 修改」逐子活动推进；驳回将终止本次运行。', true);
    }
  }

  /* ---------- 会话列表 ---------- */
  function drawConvList() {
    var host = U.$('#conv-list'); if (!host) return;
    host.innerHTML = S.conversations.map(function (c) {
      return '<div class="conv-card' + (c.id === selConv ? ' sel' : '') + '" data-conv="' + c.id + '">' +
        '<div class="cv-t">' + esc(c.title) + '</div>' +
        '<div class="cv-m"><span class="conv-intent">' + intentLabel(c.intent) + '</span>' + statusBadge(c.status || '空闲') + '</div>' +
        '<div class="cv-t mono" style="font-weight:400;font-size:10px;margin-top:6px;color:var(--text-dim)">' + esc(c.id) + ' · ' + esc(c.updated_at || '—') + '</div>' +
        '</div>';
    }).join('');
    U.$$('#conv-list .conv-card', host).forEach(function (card) {
      card.addEventListener('click', function () { selectConversation(card.getAttribute('data-conv')); });
    });
  }

  function selectConversation(id) {
    if (Demo.running) { flashBusy(); return; }
    selConv = id;
    var c = convById(id);
    resetBoard(false);
    if (c) {
      U.$('#chat-input').value = c.request || '';
      if (c.request) {
        chatBubble('会话「' + esc(c.title) + '」已加载 · 请求已预填，点击「发送」发起运行。', true);
      } else {
        chatBubble('空会话 · 输入数据质量诉求即可按意图路由至对应业务活动。', true);
      }
    }
    drawConvList();
  }

  function newConversation() {
    if (Demo.running) { flashBusy(); return; }
    var id = 'CV-' + String(S.conversations.length + 1).padStart(2, '0');
    S.conversations.push({ id: id, title: '新对话', intent: null, request: '', status: '空闲', updated_at: nowStr() });
    selConv = id;
    resetBoard(false);
    U.$('#chat-input').value = '';
    chatBubble('新建会话 ' + id + ' · 输入需求（含 探针/校验/落库/调度 → 探针生成业务活动；规则/标准/发布 → 规则生成业务活动）。', true);
    drawConvList();
  }

  function updateConvOnStart(text) {
    var c = convById(selConv);
    if (!c) return;
    if (!c.request) {
      c.request = text;
      c.title = text.length > 14 ? text.slice(0, 14) + '…' : text;
    }
    c.status = '运行中'; c.updated_at = nowStr();
    drawConvList();
  }
  function updateConvIntent(intent) {
    var c = convById(selConv);
    if (!c) return;
    c.intent = intent; c.updated_at = nowStr();
    drawConvList();
  }
  function updateConvOnFinish(st) {
    var c = convById(selConv);
    if (!c) return;
    c.status = st === 'SUCCESS' ? '已完成' : st === 'ABORTED' ? '已驳回' : '空闲';
    c.updated_at = nowStr();
    drawConvList();
  }

  /* ---------- 主管线小节点 ---------- */
  var PIPE = ['用户发起需求', '路由匹配', '知识加载', '规划子活动', '执行子活动', '子活动 Gate 判定', '任务 Finish'];
  function buildPipeMini() {
    var host = U.$('#pipe-mini'); if (!host) return;
    host.innerHTML = PIPE.map(function (p, i) {
      var cls = (i === 5 ? ' gate-node' : '');
      return '<div class="pm-node' + cls + '" id="pm-' + i + '"><span class="pm-dot"></span><span class="nm">' + p + '</span><span class="st" style="margin-left:auto;font-family:var(--mono);font-size:10px;color:var(--text-dim)" id="pm-st-' + i + '"></span></div>';
    }).join('');
  }
  function pipe(i, state, note) {
    var n = U.$('#pm-' + i); if (!n) return;
    n.classList.remove('active', 'done');
    if (state) n.classList.add(state);
    var st = U.$('#pm-st-' + i);
    if (st) st.textContent = note || (state === 'done' ? 'DONE' : state === 'active' ? 'RUN' : '');
  }

  /* ---------- Stage 卡片辅助（内联渲染进对话线程） ---------- */
  var stageSeq = 0;
  function addStage(no, name, badges) {
    stageSeq++;
    var host = U.$('#chat-stream');
    var d = document.createElement('div');
    d.className = 'stage';
    d.id = 'stage-' + no;
    d.innerHTML = '<div class="stage-head"><span class="s-no">' + no + '</span><span class="s-name">' + name + '</span>' +
      '<span class="s-state" id="sst-' + no + '"><span class="badge b-dim mono" style="font-size:10px">STEP ' + String(stageSeq).padStart(2, '0') + '</span></span></div>' +
      (badges ? '<div class="pill-list" style="margin:-4px 0 10px">' + badges + '</div>' : '') +
      '<div class="stage-body" id="sbody-' + no + '"></div>';
    host.appendChild(d);
    requestAnimationFrame(function () { d.classList.add('lit'); });
    return d;
  }
  function stageGateLit(no) {
    var d = U.$('#stage-' + no); if (d) { d.classList.remove('lit'); d.classList.add('gate-lit'); }
  }
  function stageFail(no) {
    var d = U.$('#stage-' + no); if (d) { d.classList.remove('lit'); d.classList.add('fail'); }
  }
  function sb(no) { return U.$('#sbody-' + no); }

  /* ---------- Trace 打点 + 面板 ---------- */
  function trLLM(node, out, status) {
    return S.trace({
      node: node, call_type: 'LLM', tool: null,
      latency_ms: out.latency_ms || out.data.latency_ms || 0,
      prompt_tokens: out.data.prompt_tokens, completion_tokens: out.data.completion_tokens,
      model: out.data.model || M.MockLLM.model, status: status || 'OK'
    });
  }
  function trTool(node, tool, out, status) {
    return S.trace({
      node: node, call_type: 'TOOL', tool: tool,
      latency_ms: (out && out.latency_ms) || 0,
      prompt_tokens: 0, completion_tokens: 0, status: status || 'OK'
    });
  }
  var traceBound = false;
  function pushTraceRow(entry, instant) {
    var host = U.$('#trace-live');
    if (!host) return;
    var empty = host.querySelector('.trace-empty');
    if (empty) empty.remove();
    var bar = Math.min(100, Math.round((entry.latency_ms || 0) / 1200 * 100)) || 3;
    var row = document.createElement('div');
    row.className = 'trace-row';
    if (instant) row.style.animation = 'none';
    row.innerHTML = '<span class="ct ' + (entry.call_type === 'LLM' ? 'ct-LLM' : 'ct-TOOL') + '">' + entry.call_type + '</span>' +
      '<span class="nd">' + esc(entry.node) + (entry.tool ? ' · ' + esc(entry.tool) : '') + '</span>' +
      '<span class="lat-wrap" title="延迟"><i class="lat-bar" style="transform:scaleX(' + (instant ? bar / 100 : 0) + ')"></i></span>' +
      (entry.call_type === 'LLM' ? '<span class="tk">' + entry.prompt_tokens + '/' + entry.completion_tokens + '</span>' : '<span class="tk">—</span>') +
      '<span class="lat mono">' + entry.latency_ms + 'ms</span>' +
      '<span class="st-ok">' + (entry.status === 'OK' ? 'ok' : entry.status === 'WAIT_HITL' ? '&#8964;' : 'fail') + '</span>';
    host.insertBefore(row, host.firstChild);
    if (!instant) requestAnimationFrame(function () {
      var b = row.querySelector('.lat-bar');
      if (b) b.style.transform = 'scaleX(' + bar / 100 + ')';
    });
    while (host.children.length > 60) host.removeChild(host.lastChild);
    var c = U.$('#trace-count');
    if (c) c.textContent = S.traces.length + ' 步';
  }
  function bindTraceLive() {
    /* 全局仅订阅一次，避免视图重渲染导致监听器叠加 */
    if (!traceBound) {
      traceBound = true;
      S.on(function (evt, entry) {
        if (evt !== 'trace:added') return;
        pushTraceRow(entry);
      });
    }
    /* 重渲染后回填既有 Trace（最新在上，最多 60 条） */
    var host = U.$('#trace-live');
    if (host && S.traces.length) {
      host.innerHTML = '';
      S.traces.slice().reverse().slice(0, 60).forEach(function (e) { pushTraceRow(e, true); });
    }
    var c = U.$('#trace-count');
    if (c) c.textContent = S.traces.length + ' 步';
  }

  /* ---------- 对话自动下滑 ----------
   * demo 演示时消息/阶段卡/ReAct 流不断追加，自动把对话框底部滚入视野。
   * 通过 MutationObserver 监听 #chat-stream（含流式文字）→ 节流 scrollIntoView 到底部；
   * 用户手动上滑暂停，滚回底部或重新发起运行时恢复。 */
  var chatObserver = null, scrollScheduled = false, lastScrollAt = 0;
  function stickBottom() {
    /* 消息流为内部滚动容器（输入框固定在面板底部），直接滚到流底部 */
    var host = U.$('#chat-stream');
    if (!host) return;
    if (host.scrollTo) host.scrollTo({ top: host.scrollHeight, behavior: 'smooth' });
    else host.scrollTop = host.scrollHeight;
  }
  function scheduleAutoScroll() {
    if (!Demo.autoStick || scrollScheduled) return;
    var wait = Math.max(0, 120 - (Date.now() - lastScrollAt));
    scrollScheduled = true;
    setTimeout(function () {
      scrollScheduled = false; lastScrollAt = Date.now();
      if (Demo.autoStick) stickBottom();
    }, wait);
  }
  function bindAutoScroll() {
    var host = U.$('#chat-stream');
    if (!host) return;
    if (global.MutationObserver) {
      if (chatObserver) chatObserver.disconnect();
      chatObserver = new global.MutationObserver(function () { scheduleAutoScroll(); });
      chatObserver.observe(host, { childList: true, subtree: true, characterData: true });
    }
    /* 手动上滑暂停自动下滑；滚回接近底部则恢复 */
    host.addEventListener('wheel', function (e) {
      if (e && e.deltaY < 0) Demo.autoStick = false;
    }, { passive: true });
    host.addEventListener('scroll', function () {
      if (Demo.autoStick) return;
      if ((host.scrollHeight - host.scrollTop - host.clientHeight) < 80) Demo.autoStick = true;
    }, { passive: true });
    scheduleAutoScroll();
  }

  /* ---------- ReAct 行渲染 ---------- */
  function reactLine(parent, tag, cls) {
    var row = document.createElement('div');
    row.className = 'r-line';
    var body = document.createElement('div');
    body.className = 'r-body';
    var lb = document.createElement('span');
    lb.className = 'r-tag ' + cls;
    lb.textContent = tag;
    row.appendChild(lb);
    row.appendChild(body);
    parent.appendChild(row);
    return body;
  }

  /* ---------- 主流程 ---------- */
  async function startRun(text) {
    if (Demo.running) { flashBusy(); return; }
    Demo.running = true; Demo.aborted = false; Demo.autoStick = true;
    resetBoard(true);
    updateConvOnStart(text);
    disableInputs(true);
    var run = S.startRun(text);
    console.log('%c[DQ-Prototype] ===== 对话管理 DEMO 开始 · ' + run.id + ' =====', 'color:#f5b544;font-weight:bold;');

    try {
      await stage0_request(text);
      if (Demo.aborted) return finish('ABORTED');

      var routed = await stage1_router(text);
      if (!routed || !routed.business_activity) return finish('FOLLOW_UP');
      updateConvIntent(routed.intent);

      await stage2_knowledge(routed);
      var plan = await stage3_plan(routed, text);
      await stage4_execute(plan);
      if (Demo.aborted) return finish('ABORTED');
      await stage5_finish(routed);
      finish('SUCCESS');
    } catch (err) {
      console.error('[DQ-Prototype] demo 流程异常:', err);
      finish('ERROR');
    }

    function finish(st) {
      Demo.running = false;
      S.finishRun(st);
      updateConvOnFinish(st);
      disableInputs(false);
      var b2 = U.$('#btn-demo-probe');
      if (b2) b2.innerHTML = st === 'SUCCESS' ? '&#9654;&nbsp; 再跑一遍 Demo' : '&#9654;&nbsp; Demo：探针生成';
      console.log('%c[DQ-Prototype] ===== 运行结束 · ' + st + ' =====', 'color:#f5b544;font-weight:bold;');
    }
  }

  function disableInputs(on) {
    ['#btn-send', '#btn-demo-probe', '#btn-demo-rule', '#chat-input', '#btn-mode-auto', '#btn-mode-manual'].forEach(function (sel) {
      var b = U.$(sel); if (b) b.disabled = on;
    });
  }

  function flashBusy() {
    var c = U.$('#chat-card');
    if (c) { c.classList.remove('flash-ok'); void c.offsetWidth; c.classList.add('flash-ok'); }
  }

  function chatBubble(html, sys) {
    var host = U.$('#chat-stream');
    var d = document.createElement('div');
    d.className = 'bubble' + (sys ? ' sys' : '');
    d.innerHTML = html;
    host.appendChild(d);
    return d;
  }

  /* ① 用户发起需求 */
  async function stage0_request(text) {
    pipe(0, 'active');
    chatBubble('<b style="color:var(--primary-2)">业务人员</b> · ' + esc(text));
    await sleep(500);
    chatBubble('config 上下文注入：对话管理（对话即运行态）· 候选业务活动 [BA-01 探针生成 · BA-02 规则生成] 均已发布 · Gate 策略 HUMAN（每个子业务活动人工确认 HITL）· 演示模式：' + (Demo.mode === 'auto' ? '<b style="color:var(--teal)">一键全自动</b>' : '<b style="color:var(--amber)">手工逐步</b>') + ' · 租户 T-DS41（MOCK）', true);
    await sleep(400);
    pipe(0, 'done');
  }

  /* ② 路由匹配：三层子级 + 对话内显式路由结果 */
  async function stage1_router(message) {
    pipe(1, 'active');
    addStage(2, '路由匹配 · 三层 Router',
      '<span class="pill">Stage1 状态检测</span><span class="pill">Stage2 意图分类</span><span class="pill">Stage3 动作执行</span>');
    var host = sb(2);
    host.innerHTML = '<div class="substages">' +
      '<div class="substage" id="sub1"><div class="t">STAGE1 · 状态检测</div><div class="v" id="sub1v">…</div></div><span class="sub-arrow">&rarr;</span>' +
      '<div class="substage" id="sub2"><div class="t">STAGE2 · 意图分类</div><div class="v" id="sub2v">…</div></div><span class="sub-arrow">&rarr;</span>' +
      '<div class="substage" id="sub3"><div class="t">STAGE3 · 动作执行</div><div class="v" id="sub3v">…</div></div></div>';

    /* Stage1 状态检测 */
    U.$('#sub1').classList.add('active'); U.$('#sub1v').textContent = '检测会话状态…';
    var o1 = await M.MockLLM.detectState({ session: S.activeRunId });
    trLLM('router_stage1_state', o1);
    U.$('#sub1v').innerHTML = '<b style="color:var(--teal)">' + esc(o1.data.result.label) + '</b>';
    U.$('#sub1').classList.remove('active'); U.$('#sub1').classList.add('done');
    await sleep(260);

    /* Stage2 意图分类 — 固定枚举 + 命中高亮 + 关键词信号 */
    U.$('#sub2').classList.add('active'); U.$('#sub2v').textContent = 'LLM 分类中…';
    var o2 = await M.MockLLM.classifyIntent(message);
    trLLM('router_stage2_intent', o2);
    var r2 = o2.data.result;
    var chips = r2.enum.map(function (e) {
      return '<span class="intent-chip" data-e="' + e + '">' + e + '</span>';
    }).join('');
    var signalHtml = '<div class="pill-list" style="margin-top:8px">' + r2.signals.map(function (sg) {
      return '<span class="pill">命中「' + esc(sg.kw) + '」→ ' + esc(sg.to) + '</span>';
    }).join('') + '</div>';
    U.$('#sub2v').innerHTML = '<span class="mono">置信度 <b style="color:var(--ok)">' + r2.confidence + '</b> · ' + esc(r2.reasoning) + '</span>' + signalHtml + '<div class="intent-chips">' + chips + '</div>';
    await sleep(400);
    var hitChip = U.$('#sub2 .intent-chip[data-e="' + r2.intent + '"]');
    if (hitChip) hitChip.classList.add('hit');
    U.$('#sub2').classList.remove('active'); U.$('#sub2').classList.add('done');
    await sleep(400);

    /* Stage3 动作执行 — 路由至业务活动 */
    U.$('#sub3').classList.add('active'); U.$('#sub3v').textContent = '动作路由…';
    var o3 = await M.MockLLM.routeAction(r2.intent);
    trLLM('router_stage3_action', o3);
    var r3 = o3.data.result;
    if (r3.business_activity) {
      U.$('#sub3v').innerHTML = '命中意图 <b style="color:var(--teal)">' + esc(r3.intent) + '</b> → 路由至业务活动 <b style="color:var(--primary-2)">「' + esc(r3.business_activity) + '」</b>（' + esc(r3.ba_id) + '）· 子图 <code class="mono">' + esc(r3.target_graph) + '</code><br><span class="small muted">' + esc(r3.reasoning) + '</span>';
      chatBubble('<b style="color:var(--teal)">【路由结果】</b>命中意图 <b class="mono">' + esc(r3.intent) + '</b> → 路由至业务活动<b>「' + esc(r3.business_activity) + '」</b>（' + esc(r3.ba_id) + ' · 子图 ' + esc(r3.target_graph) + '）', true);
    } else {
      U.$('#sub3v').innerHTML = '命中意图 <b style="color:var(--amber)">' + esc(r3.intent) + '</b> → <b>未路由到业务活动</b><br><span class="small muted">' + esc(r3.reasoning) + '</span>';
      chatBubble('本次请求未命中运行态意图（置信度较低）。请明确诉求：含 <b>探针 / 校验 / 落库 / 调度</b> → 探针生成业务活动；含 <b>规则 / 标准 / 发布</b> → 规则生成业务活动。也可点击上方 Demo 按钮一键跑通。', true);
    }
    U.$('#sub3').classList.remove('active'); U.$('#sub3').classList.add('done');
    pipe(1, 'done');
    return r3;
  }

  /* ③ 知识加载（Planner 白名单 + knowledge.load Tool） */
  async function stage2_knowledge(routed) {
    pipe(2, 'active');
    addStage(3, '知识加载 · Planner 按子业务活动白名单（P5 · 经权限校验 · Tool 加载）');
    var host = sb(3);
    host.innerHTML = '<div class="small muted" id="kn-note">Planner 决策加载范围…</div><div class="kn-grid" id="kn-grid" style="margin-top:10px"></div>';

    var oSel = await M.MockLLM.selectKnowledge(routed.intent);
    trLLM('knowledge_select(planner)', oSel);
    U.$('#kn-note').innerHTML = '选择 <b style="color:var(--teal)">' + oSel.data.result.selected.join(' / ') + '</b> —— ' + esc(oSel.data.result.reason) + ' <span class="mock-tag">MOCK</span>';
    var grid = U.$('#kn-grid');

    for (var i = 0; i < oSel.data.result.selected.length; i++) {
      var knId = oSel.data.result.selected[i];
      var meta = S.knowledge.filter(function (k) { return k.id === knId; })[0];
      var card = document.createElement('div');
      card.className = 'kn-card';
      card.innerHTML = '<div class="k-t">' + esc(meta.name) + ' <span class="badge b-blue">' + meta.type + '</span></div><div class="snippet typing" style="min-height:32px">knowledge.load 拉取中…</div>' +
        '<div class="k-meta"><span>来源: <b>' + esc(meta.source) + '</b> <span class="mock-tag">MOCK</span></span><span>权限: <b style="color:var(--amber)">' + esc(meta.scope) + ' · ' + esc(meta.permission_tag) + '</b></span><span>Tool: <b class="mono">knowledge.load</b></span></div>';
      grid.appendChild(card);
      var oK = await M.MockKnowledge.load(knId);
      trTool('knowledge_load', 'knowledge.load(' + knId + ')', oK);
      card.querySelector('.snippet').classList.remove('typing');
      card.querySelector('.snippet').textContent = oK.data.snippet;
      card.classList.add('done');
      await sleep(220);
    }
    pipe(2, 'done');
  }

  /* ---------- 子业务活动进展（右栏侧显 · 随进度更新） ---------- */
  var SP_STATE = { wait: '等待', run: '执行中', gate: 'Gate 人工确认', done: '通过', fail: '驳回' };
  function renderSubtaskProgress(plan) {
    var host = U.$('#sp-list'); if (!host) return;
    host.innerHTML = plan.subtasks.map(function (t) {
      return '<div class="sp-item wait" id="sp-' + t.id + '">' +
        '<span class="sp-dot"></span>' +
        '<span class="sp-id mono">' + t.id + '</span>' +
        '<span class="sp-name">' + esc(t.name) + '</span>' +
        '<span class="sp-st">' + SP_STATE.wait + '</span></div>';
    }).join('');
    updateSpCount(plan);
  }
  function setSubtaskState(plan, id, state) {
    var el = U.$('#sp-' + id); if (!el) return;
    el.className = 'sp-item ' + state;
    var stEl = el.querySelector('.sp-st'); if (stEl) stEl.textContent = SP_STATE[state] || state;
    updateSpCount(plan);
  }
  function updateSpCount(plan) {
    var c = U.$('#sp-count'); if (!c || !plan) return;
    var total = plan.subtasks.length, done = 0, failed = false;
    plan.subtasks.forEach(function (t) {
      var e = U.$('#sp-' + t.id); if (!e) return;
      if (e.classList.contains('done')) done++;
      if (e.classList.contains('fail')) { done++; failed = true; }
    });
    if (failed) { c.textContent = '已终止 ' + done + '/' + total; c.className = 'badge b-danger mono'; }
    else if (done >= total) { c.textContent = '全部完成 ' + done + '/' + total; c.className = 'badge b-ok mono'; }
    else if (done === 0) { c.textContent = '待执行 0/' + total; c.className = 'badge b-dim mono'; }
    else { c.textContent = '进行中 ' + done + '/' + total; c.className = 'badge b-teal mono'; }
  }
  function resetSubtaskProgress() {
    var host = U.$('#sp-list');
    if (host) host.innerHTML = '<div class="sp-empty">规划子活动完成后，在此显示子业务活动列表与进展</div>';
    var c = U.$('#sp-count'); if (c) { c.textContent = '待规划'; c.className = 'badge b-dim mono'; }
  }

  /* ④ 规划子活动（DAG · 按命中的业务活动选 plan/planRule） */
  async function stage3_plan(routed, text) {
    pipe(3, 'active');
    addStage(4, '规划子活动 · Planner 产出 DAG 骨架');
    var host = sb(4);
    host.innerHTML = '<div class="small muted mono" id="plan-note">plan_subtasks 生成中…</div><div class="dag" id="dag" style="margin-top:12px"></div>';
    var oP = routed.intent === 'RUN_RULE_REQUEST'
      ? await M.MockLLM.planRule(text)
      : await M.MockLLM.plan(text);
    trLLM('plan_subtasks', oP);
    var p = oP.data.result;
    U.$('#plan-note').innerHTML = 'dag_id=<b style="color:var(--teal)">' + p.dag_id + '</b> · 业务活动 <b style="color:var(--primary-2)">' + esc(p.business_activity) + '</b> · 节点 ' + p.subtasks.length +
      ' · <span class="mock-tag">MOCK LLM</span> · ' + esc(p.dag_note);

    function nodeHtml(t) {
      var gateTag = (p.gate_all || t.gate === 'HUMAN')
        ? '<span class="badge b-amber" style="margin-left:6px;font-size:9px;padding:1px 5px">人工确认</span>'
        : (t.id === p.gate_node ? '<span class="badge b-amber" style="margin-left:6px">HITL</span>' : '');
      return '<span class="dag-node wait" id="dn-' + t.id + '"><span class="idc">' + t.id + '</span>' + esc(t.name) + gateTag + '</span>';
    }
    function edgeHtml(i) { return '<span class="dag-edge" id="de-e' + i + '">&rarr;</span>'; }
    U.$('#dag').innerHTML =
      '<div class="dag-row">' + p.subtasks.map(function (t, i) {
        return nodeHtml(t) + (i < p.subtasks.length - 1 ? edgeHtml(i + 1) : '');
      }).join('') + '</div>' +
      '<div class="dag-note" id="dag-note"></div>';
    renderSubtaskProgress(p); /* 规划完成 → 右栏侧显子业务活动列表（全部“等待”）*/

    for (var j = 0; j < p.subtasks.length; j++) {
      var n = U.$('#dn-' + p.subtasks[j].id);
      n.classList.remove('wait'); n.classList.add('active');
      await sleep(300);
      n.classList.remove('active'); n.classList.add('done');
      var e = U.$('#de-e' + (j + 1)); if (e) e.classList.add('lit');
    }
    pipe(3, 'done');
    return p;
  }

  /* ⑤ 执行子活动（ReAct 流 + 每子活动 Gate 人工确认 · 扩展 v4 §2） */
  async function stage4_execute(plan) {
    pipe(4, 'active');
    addStage(5, '执行子活动 · Executor ReAct 循环（Thought → Action → Observation）· 每个子活动 Gate 人工确认');
    var host = sb(5);

    for (var i = 0; i < plan.subtasks.length; i++) {
      var st = plan.subtasks[i];
      if (Demo.aborted) return;
      setSubtaskState(plan, st.id, 'run');

      var block = document.createElement('div');
      block.className = 'subtask-block';
      block.id = 'blk-' + st.id;
      block.innerHTML = '<div class="st-head"><span class="badge b-dim mono">' + st.id + '</span>' + esc(st.name) +
        '<span class="small muted" style="font-weight:400">· ' + esc(st.goal) + '</span><span style="margin-left:auto" id="bh-' + st.id + '"><span class="running-note"><span class="spin"></span>ReAct</span></span></div><div class="react" id="rc-' + st.id + '"></div>';
      host.appendChild(block);
      var dn = U.$('#dn-' + st.id);
      if (dn) { dn.classList.remove('done'); dn.classList.add('active'); }
      U.$('#dag-note').textContent = '▶ Executor 正在执行 ' + st.id + ' ' + st.name + '（工具链: ' + st.tool_chain.join(' → ') + '）';
      await sleep(250);

      await runSubtask(st);
      if (Demo.aborted) return;

      var hb = U.$('#bh-' + st.id);
      if (hb) hb.innerHTML = '<span class="badge b-ok">DONE</span>';
      if (dn) { dn.classList.remove('active'); dn.classList.add('done'); }

      /* —— 每个子活动：执行 ReAct → 子活动 Gate 判定（人工确认 HITL）→ 通过后进入下一个子活动 —— */
      setSubtaskState(plan, st.id, 'gate');
      await gateConfirm(st, plan);
      if (Demo.aborted) { setSubtaskState(plan, st.id, 'fail'); return; }
      setSubtaskState(plan, st.id, 'done');
      pipe(4, 'active');
    }
    pipe(4, 'done');
    pipe(5, 'done');
  }

  /* 按场景分支执行一个子业务活动 */
  async function runSubtask(st) {
    var rc = U.$('#rc-' + st.id);

    /* Thought（打字机） */
    var oT = await M.MockLLM.thought(st.scene, st);
    trLLM('react_thought(' + st.id + ')', oT);
    var tw = reactLine(rc, 'THOUGHT', 'r-thought');
    await M.MockLLM.streamText(tw, oT.data.result.thought, 14);
    await sleep(180);

    var scene = st.scene;

    if (scene === 'locate') {
      var a1 = reactLine(rc, 'ACTION', 'r-action');
      a1.innerHTML = '<code>ontology.lookup(entity="order")</code> <span class="mock-tag">MOCK</span>';
      var oO = await M.MockOntology.lookup('order');
      trTool('execute_subtask.' + st.id, 'ontology.lookup', oO);
      var b1 = reactLine(rc, 'OBSERVATION', 'r-obs');
      b1.innerHTML = '<div class="tool-out">实体 <b style="color:var(--teal)">order</b> → 表 <b>ods_order_detail</b>（' + esc(oO.data.entities[0].comment) + '）\n主键属性: <b>order_id</b> VARCHAR(32) · pk=true · NOT NULL\n关系: order 1:N order_item (key=order_id) · customer 1:N order (key=cust_id)</div>';
    }

    else if (scene === 'rule') {
      var a2 = reactLine(rc, 'ACTION', 'r-action');
      a2.innerHTML = '<code>rule.list(field="ods_order_detail.order_id")</code> <span class="mock-tag">MOCK</span>';
      var oRL = await M.MockRulebank.list('ods_order_detail.order_id');
      trTool('execute_subtask.' + st.id, 'rule.list', oRL);
      var r2 = oRL.data.rules[0];
      var b2 = reactLine(rc, 'OBSERVATION', 'r-obs');
      b2.innerHTML = '<div class="tool-out">命中规则 <b style="color:var(--teal)">' + r2.rule_id + ' · ' + r2.name + '</b>（' + r2.dimension + ' · ' + r2.standard_id + ' · ' + r2.status + '）\n判定口径: <code>' + esc(r2.expression) + '</code> → ' + esc(r2.judge) + '\n已有关联探针: ' + esc(r2.existing_probes.join(' , ')) + '（本次补充可执行 SQL/Python 双探针）</div>';
    }

    else if (scene === 'gen') {
      var oG = await M.MockLLM.genSQLProbe();
      trLLM('llm.generate_sql_probe', oG);
      var a = reactLine(rc, 'ACTION', 'r-action');
      a.innerHTML = '<code>sql.execute(datasource="ds-01", sql=&lt;SQL探针试跑&gt;)</code> <span class="mock-tag">MOCK</span>';
      var oQ = await M.MockDatasource.runQuery(oG.data.result.code);
      trTool('execute_subtask.' + st.id, 'sql.execute', oQ);
      var b = reactLine(rc, 'OBSERVATION', 'r-obs');
      b.innerHTML = '<div class="tool-out">生成 SQL 取数探针（RULE-0101 口径）：<br>' + esc(oG.data.result.code).replace(/\n/g, '<br>') + '</div><div class="tool-out" style="margin-top:6px">试跑 rows: total_rows=' + oQ.data.rows[0].total_rows + ' · null_rows=' + oQ.data.rows[0].null_rows + ' · 耗时 ' + oQ.data.duration_ms + 'ms · <b style="color:var(--ok)">语法/口径 OK</b></div>';
      Demo.genProbes.sql = { code: oG.data.result.code, datasource_id: oG.data.result.datasource_id };
      await sleep(200);

      var oP = await M.MockLLM.genPythonProbe();
      trLLM('llm.generate_python_probe', oP);
      var a3 = reactLine(rc, 'ACTION', 'r-action');
      a3.innerHTML = '<code>python.run(&lt;Python比对探针&gt;)</code> <span class="mock-tag">MOCK</span>';
      var oR = await M.MockProbeRunner.runPython('PY-GEN-01');
      trTool('execute_subtask.' + st.id, 'python.run', oR);
      var b3 = reactLine(rc, 'OBSERVATION', 'r-obs');
      b3.innerHTML = '<div class="tool-out">生成 Python 空值率比对探针：<br>' + esc(oP.data.result.code).replace(/\n/g, '<br>') + '</div><div class="tool-out" style="margin-top:6px">stdout: ' + esc(oR.data.stdout) + '<br>status: <b style="color:var(--ok)">' + oR.data.status + '</b> · null_ratio=0.0 · threshold=0.0 · 双探针试跑通过</div>';
      Demo.genProbes.py = { code: oP.data.result.code };
    }

    else if (scene === 'persist') {
      var a4 = reactLine(rc, 'ACTION', 'r-action');
      a4.innerHTML = '<code>probe.upsert({SQL探针}) ; probe.upsert({PYTHON探针})</code> <span class="mock-tag">MOCK</span>';
      var oU1 = await M._delayed('Tool', 'probe.upsert(SQL)', function () { return { probe_id: 'PRB-2001', status: 'RUNNABLE', rule_id: 'RULE-0101', version: 'v1' }; });
      trTool('execute_subtask.' + st.id, 'probe.upsert', oU1);
      var oU2 = await M._delayed('Tool', 'probe.upsert(PYTHON)', function () { return { probe_id: 'PRB-2002', status: 'RUNNABLE', rule_id: 'RULE-0101', version: 'v1' }; });
      trTool('execute_subtask.' + st.id, 'probe.upsert', oU2);
      /* 写入产物探针（含执行统计字段，扩展 v2 §2.6；联动 RULE-0101 关联探针 +2） */
      S.addProbe({ id: 'PRB-2001', rule_id: 'RULE-0101', name: 'order.order_id 非空校验（SQL）', type: 'SQL', status: 'RUNNABLE', datasource_id: 'ds-01', code: Demo.genProbes.sql.code, exec_count: 0, success_rate: null, last_run: null, from_demo: true, run_id: S.activeRunId });
      S.addProbe({ id: 'PRB-2002', rule_id: 'RULE-0101', name: 'order.order_id 空值率阈值（PYTHON）', type: 'PYTHON', status: 'RUNNABLE', datasource_id: 'ds-01', code: Demo.genProbes.py.code, exec_count: 0, success_rate: null, last_run: null, from_demo: true, run_id: S.activeRunId });
      global.DQAssetsMarkFresh && global.DQAssetsMarkFresh(['PRB-2001', 'PRB-2002']);
      await sleep(200);

      var a5 = reactLine(rc, 'ACTION', 'r-action');
      a5.innerHTML = '<code>probe.schedule("PRB-2001","0 0 * * *") ; probe.schedule("PRB-2002","0 0 * * *")</code> <span class="mock-tag">MOCK</span>';
      var oSch1 = await M.MockScheduler.createSchedule('PRB-2001', '0 0 * * *');
      trTool('execute_subtask.' + st.id, 'probe.schedule', oSch1);
      var oSch2 = await M.MockScheduler.createSchedule('PRB-2002', '0 0 * * *');
      trTool('execute_subtask.' + st.id, 'probe.schedule', oSch2);
      Demo.schedule = oSch1.data;
      ['PRB-2001', 'PRB-2002'].forEach(function (pid) {
        var p = S.probes.filter(function (x) { return x.id === pid; })[0];
        if (p) { p.status = 'SCHEDULED'; p.cron = '0 0 * * *'; p.cron_human = '每天 00:00'; }
      });
      var b4 = reactLine(rc, 'OBSERVATION', 'r-obs');
      b4.innerHTML = '<div class="tool-out">落库成功（P2：经 Tool 原子写入，非业务活动私有数据）\nPRB-2001 SQL · PRB-2002 PYTHON · RUNNABLE→SCHEDULED · 归属 RULE-0101（关联探针 2→4）· 已同步至「产物探针」「规则管理」页\nschedule_id=' + esc(oSch1.data.schedule_id) + ' · cron=<b style="color:var(--teal)">0 0 * * *</b>（每天凌晨 00:00） · next_run=' + esc(oSch1.data.next_run) + '\n' + esc(oSch1.data.retry_policy) + '</div>';
    }

    else if (scene === 'lineage') {
      var al = reactLine(rc, 'ACTION', 'r-action');
      al.innerHTML = '<code>lineage.query(table="ods_order_detail", field="order_id")</code> <span class="mock-tag">MOCK</span>';
      var oL = await M.MockLineage.query('ods_order_detail', 'order_id');
      trTool('execute_subtask.' + st.id, 'lineage.query', oL);
      var up = oL.data.upstream.map(function (x) { return '· ' + esc(x.src) + '（' + esc(x.transform) + ' · ' + esc(x.level) + '）'; }).join('\n');
      var dnText = oL.data.downstream.map(function (x) { return '· ' + esc(x.tgt) + '（' + esc(x.transform) + ' · ' + esc(x.level) + '）'; }).join('\n');
      var bl = reactLine(rc, 'OBSERVATION', 'r-obs');
      bl.innerHTML = '<div class="tool-out">order_id 上游:\n' + up + '\n\norder_id 下游:\n' + dnText + '\n\n影响面: ' + esc(oL.data.impact) + '</div>';
    }

    else if (scene === 'standard') {
      var as1 = reactLine(rc, 'ACTION', 'r-action');
      as1.innerHTML = '<code>standard.list()</code> <span class="mock-tag">MOCK</span>';
      var oSL = await M.MockStandard.list();
      trTool('execute_subtask.' + st.id, 'standard.list', oSL);
      var std02 = oSL.data.standards.filter(function (x) { return x.id === 'STD-002'; })[0];
      var bs1 = reactLine(rc, 'OBSERVATION', 'r-obs');
      bs1.innerHTML = '<div class="tool-out">标准清单命中 <b style="color:var(--teal)">' + std02.id + ' · ' + std02.name + '（' + std02.version + ' · ' + std02.status + '）</b>\n适用范围: ' + esc(std02.applies || std02.domain) + '</div>';
      await sleep(200);

      var as2 = reactLine(rc, 'ACTION', 'r-action');
      as2.innerHTML = '<code>knowledge.load("KN-04")</code> <span class="mock-tag">MOCK</span>';
      var oK4 = await M.MockKnowledge.load('KN-04');
      trTool('execute_subtask.' + st.id, 'knowledge.load', oK4);
      var bs2 = reactLine(rc, 'OBSERVATION', 'r-obs');
      bs2.innerHTML = '<div class="tool-out">' + esc(oK4.data.snippet) + '\n规则维度取值: <b style="color:var(--teal)">' + std02.dimension + '</b> · 判定要求: 非空 + 唯一探针（本次先落非空）</div>';
    }

    else if (scene === 'genRule') {
      var oGR = await M.MockLLM.genRule();
      trLLM('llm.generate_rule', oGR);
      var ru = oGR.data.result;
      Demo.genRule = ru;
      var ag1 = reactLine(rc, 'ACTION', 'r-action');
      ag1.innerHTML = '<code>rule.upsert({RULE-0107 · 订单主键非空})</code> <span class="mock-tag">MOCK</span>';
      var oUP = await M.MockRule.upsert(ru);
      trTool('execute_subtask.' + st.id, 'rule.upsert', oUP);
      /* 草稿规则写入规则管理（P2 经 Tool 落库，扩展 v3 §4 Demo B） */
      S.addRule({ id: ru.rule_id, standard_id: ru.standard_id, name: ru.name, dimension: ru.dimension,
        expression: ru.expression, judge: ru.judge, status: '草稿', version: oUP.data.version,
        probe_ids: [], exec_count: 0, success_count: 0, success_rate: null, last_run: null, trend: [],
        from_demo: true, run_id: S.activeRunId });
      var bg1 = reactLine(rc, 'OBSERVATION', 'r-obs');
      bg1.innerHTML = '<div class="tool-out">生成并落库 <b style="color:var(--teal)">' + ru.rule_id + ' · ' + ru.name + '</b>\n表达式: <code>' + esc(ru.expression) + '</code> → ' + esc(ru.judge) + '\n维度: ' + ru.dimension + ' · 关联标准: ' + ru.standard_id + '（主键质量规范 v1.8）\n状态: <b style="color:var(--amber)">草稿</b>（已同步至「规则管理」，待 ST-5 发布）</div>';
    }

    else if (scene === 'publish') {
      var ap = reactLine(rc, 'ACTION', 'r-action');
      ap.innerHTML = '<code>rule.publish("RULE-0107")</code> <span class="mock-tag">MOCK</span>';
      var oPub = await M.MockRule.publish(Demo.genRule ? Demo.genRule.rule_id : 'RULE-0107');
      trTool('execute_subtask.' + st.id, 'rule.publish', oPub);
      /* 合并写入：草稿 → 生效 + 版本 + 标准回写（rules:changed → 规则管理实时出现） */
      S.addRule({ id: oPub.data.rule_id, status: oPub.data.status, version: oPub.data.version, writeback: oPub.data.writeback, published_at: nowStr() });
      var bp = reactLine(rc, 'OBSERVATION', 'r-obs');
      bp.innerHTML = '<div class="tool-out">发布成功（P2：经 rule.publish 原子写入）\n' + esc(oPub.data.rule_id) + ' 状态 <b style="color:var(--amber)">草稿</b> → <b style="color:var(--ok)">生效</b> · 版本 ' + esc(oPub.data.version) + '\n' + esc(oPub.data.writeback) + '\n可在 <a href="#/rules" style="color:var(--primary-2)">规则管理</a> 查看（关联探针 0，后续可发起探针生成）</div>';
    }

    await sleep(260);
  }

  /* 子活动 Gate 判定 · 人工确认（HITL）——每个子活动都过 Gate（扩展 v4 §2）
   * AUTO  ：卡片渲染（LLM advisory + 按钮置灰展示）→ 约 700ms 后自动通过，标注「已自动确认 · 自动演示」，零点击
   * MANUAL：interrupt() 挂起（右栏 Gate 节点 WAIT），业务人员点击 通过/驳回/修改；驳回 = 终止运行 */
  async function gateConfirm(st, plan) {
    var host = sb(5) || U.$('#chat-stream');
    var isAuto = Demo.mode === 'auto';
    pipe(5, 'active', 'WAIT');
    stageGateLit(5);
    var card = document.createElement('div');
    card.className = 'gate-card hitl';
    card.id = 'gate-card-' + st.id;
    card.innerHTML =
      '<div style="font-weight:700;font-size:13px;color:var(--amber)"><span class="wait-ico"></span>子活动 Gate 判定 · 人工确认（HITL）' +
      '<span class="mono small" style="float:right;color:var(--text-dim)">' + st.id + ' · ' + esc(st.name) + '</span></div>' +
      '<div class="small muted" style="margin-top:6px">Gate 策略 = <b class="mono">HUMAN</b>（人工确认 · LangGraph interrupt() + Command(resume=…) 前端模拟）。本子活动 ReAct 产出已完成，LLM 建议仅供参考，最终由业务人员决策。</div>' +
      '<div id="gadv-' + st.id + '"><div class="g-row"><span class="k">LLM 建议</span><span><span class="spin"></span> 生成建议中…</span></div></div>';
    host.appendChild(card);
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });

    /* LLM advisory（MOCK · 建议 PASS + score + 理由） */
    var oG = await M.MockLLM.gate(st.name, 'HUMAN');
    trLLM('gate_subtask(' + st.id + ')', oG);
    var adv = U.$('#gadv-' + st.id);
    if (adv) adv.innerHTML = '<div class="g-row"><span class="k">LLM 建议</span><span><b style="color:var(--ok)">建议 PASS</b>（score ' + oG.data.result.score + '）—— ' + esc(oG.data.result.reason) + '</span></div>';

    /* Gate 卡三按钮（全自动模式下置灰展示，不可点击） */
    var acts = document.createElement('div');
    acts.className = 'hitl-actions';
    acts.id = 'gacts-' + st.id;
    var dis = isAuto ? ' disabled' : '';
    acts.innerHTML =
      '<button class="btn btn-teal" data-hitl="PASS"' + dis + '>&#10003; 通过</button>' +
      '<button class="btn btn-danger" data-hitl="REJECT"' + dis + '>&#10007; 驳回</button>' +
      '<button class="btn btn-amber" data-hitl="EDIT"' + dis + '>&#9998; 修改</button>' +
      '<span class="small muted">' + (isAuto
        ? '<span class="spin"></span> 自动演示：Gate 自动确认中（约 0.7s）…'
        : '流程已在本子活动 Gate 处中断挂起 · 等待业务人员点击决策') + '</span>';
    card.appendChild(acts);

    /* interrupt 挂起打点 */
    S.trace({ node: 'interrupt(HITL) ' + st.name + ' 人工确认', call_type: 'TOOL', tool: null, latency_ms: 0, prompt_tokens: 0, completion_tokens: 0, status: 'WAIT_HITL' });

    var decision;
    if (isAuto) {
      await sleep(700);
      if (Demo.aborted) return;
      decision = 'PASS';
      acts.innerHTML = '<span class="badge b-ok">&#10003; 已自动确认 · 自动演示</span><span class="small muted" style="margin-left:8px">一键全自动模式 · Command(resume=PASS)</span>';
      card.classList.remove('hitl');
      card.classList.add('auto-confirmed');
    } else {
      Demo.waitingHitl = true;
      decision = await new Promise(function (resolve) {
        Demo.hitlResolver = resolve;
        U.$$('#gacts-' + st.id + ' [data-hitl]').forEach(function (b) {
          b.addEventListener('click', function () { resolve(b.getAttribute('data-hitl')); });
        });
      });
      Demo.waitingHitl = false;
      Demo.hitlResolver = null;
      acts.innerHTML = decision === 'PASS'
        ? '<span class="badge b-ok">&#10003; 人工确认：通过 · Command(resume=PASS)</span>'
        : decision === 'EDIT'
          ? '<span class="badge b-amber">&#9998; 人工确认：已按业务意见修改后通过（口径注释已补充：仅校验 TRIM 后判空）· Command(resume=EDIT)</span>'
          : '<span class="badge b-danger">&#10007; 人工确认：驳回 · 流程终止</span>';
      card.classList.remove('hitl');
      card.classList.add('decided');
    }
    S.trace({ node: 'resume(HITL) 决策=' + decision, call_type: 'TOOL', tool: null, latency_ms: 0, prompt_tokens: 0, completion_tokens: 0, status: decision === 'REJECT' ? 'FAIL' : 'OK' });

    if (decision === 'REJECT') {
      Demo.aborted = true;
      stageFail(5);
      pipe(5, 'active', 'FAIL');
      var stop = document.createElement('div');
      stop.className = 'bubble sys';
      stop.style.borderColor = 'rgba(255,92,122,.5)';
      stop.innerHTML = '<b style="color:var(--danger)">运行已驳回：</b>「' + esc(st.name) + '（' + st.id + '）」子业务活动 Gate 未通过，后续子业务活动不再执行，本次运行终止（ABORTED）。可点击「Demo：' + (plan.ba_id === 'BA-02' ? '规则生成' : '探针生成') + '」再次发起。';
      U.$('#chat-stream').appendChild(stop);
      return;
    }
    /* 通过 / 修改后通过：Stage 卡片由琥珀(HITL)回到青色（继续下一子活动） */
    var sc = U.$('#stage-5');
    if (sc) { sc.classList.remove('gate-lit', 'fail'); sc.classList.add('lit'); }
    pipe(5, 'active', 'PASS·' + st.id);
    await sleep(300);
  }

  /* ⑥ 任务 Finish 判断 + 成功总结（按命中的业务活动分支） */
  async function stage5_finish(routed) {
    var isRule = routed.intent === 'RUN_RULE_REQUEST';
    pipe(6, 'active');
    addStage(7, '任务 Finish 判断', '<span class="pill">LLM 判断</span><span class="pill">可选人工复核</span>');
    stageGateLit(7);
    var host = sb(7);
    host.innerHTML = '<div class="small muted" id="fin-note"><span class="spin"></span> finish_check：整体任务是否 Finish…</div>';
    var oF = isRule
      ? await M.MockLLM.finishCheck(
          '5 个子业务活动全部通过：本体探查 → 血缘探查 → 标准探查 → 规则生成 → 规则发布（每个子活动 Gate 均人工确认通过）。RULE-0107「订单主键非空」已发布为「生效」（v1 · 标准 STD-002 关联回写）。',
          ['在「规则管理」为 RULE-0107 配置探针（可发起探针生成业务活动）', '标准回写与生效状态可在规则管理复核', '本次调用链已写入链路追踪']
        )
      : await M.MockLLM.finishCheck();
    trLLM('finish_check', oF);
    U.$('#fin-note').innerHTML = '<span class="badge b-ok">FINISH = TRUE</span>&nbsp; ' + esc(oF.data.result.summary) + ' <span class="mock-tag">MOCK</span>' +
      '<div class="g-row"><span class="k">后续建议</span><span>' + oF.data.result.followups.map(esc).join(' · ') + '</span></div>';

    /* 成功总结卡 */
    var sum = document.createElement('div');
    sum.className = 'stage lit';
    sum.style.animationDelay = '.1s';
    if (isRule) {
      var ru = Demo.genRule || { rule_id: 'RULE-0107', name: '订单主键非空', dimension: '完整性', standard_id: 'STD-002', expression: 'order_id IS NOT NULL', judge: 'null_rows=0 → PASS' };
      sum.innerHTML =
        '<div class="stage-head"><span class="s-no" style="background:rgba(55,214,122,.18);border-color:var(--ok);color:var(--ok)">&#10003;</span><span class="s-name">Demo 完成 · 产出业务资产</span><span class="s-state"><span class="badge b-ok mono">SUCCESS</span></span></div>' +
        '<div class="result-grid">' +
          '<div><div class="small" style="margin-bottom:6px"><span class="badge b-teal">' + ru.rule_id + ' · ' + ru.name + '</span> <span class="mock-tag">MOCK 生成</span></div>' +
          U.codeBlock('rule_id    : ' + ru.rule_id + '\nname       : ' + ru.name + '\ndimension  : ' + ru.dimension + '\nstandard   : ' + ru.standard_id + '（主键质量规范 v1.8）\nexpression : ' + ru.expression + '\njudge      : ' + ru.judge) + '</div>' +
          '<div class="kn-card done"><div class="k-t">发布回执 <span class="mock-tag">MOCK</span></div><div class="k-meta" style="border:none;padding:0"><span>状态: <b style="color:var(--ok)">草稿 → 生效</b>（rule.publish · HITL 通过）</span><span>版本: <b class="mono">v1</b></span><span>标准回写: <b>已回写 STD-002 规则关联</b></span><span>关联探针: <b>0</b>（后续可发起探针生成）</span></div></div>' +
        '</div>' +
        '<div class="divider"></div>' +
        '<div class="kn-card done"><div class="k-t">闭环动作</div><div class="k-meta" style="border:none;padding:0"><span>新规则 <b>RULE-0107（生效）</b>已写入「规则管理」，无需刷新即可见</span><span>本次调用链已写入 <b>链路追踪</b>（' + S.traces.length + ' 步）</span></div>' +
        '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><a class="btn btn-primary" href="#/rules" style="text-decoration:none;font-size:12px;padding:7px 12px">查看规则管理（RULE-0107）</a><a class="btn btn-ghost" href="#/trace" style="text-decoration:none;font-size:12px;padding:7px 12px">查看 Trace</a></div></div>';
    } else {
      var sqlc = Demo.genProbes.sql ? Demo.genProbes.sql.code : '';
      var pyc = Demo.genProbes.py ? Demo.genProbes.py.code : '';
      var sch = Demo.schedule || {};
      sum.innerHTML =
        '<div class="stage-head"><span class="s-no" style="background:rgba(55,214,122,.18);border-color:var(--ok);color:var(--ok)">&#10003;</span><span class="s-name">Demo 完成 · 产出业务资产</span><span class="s-state"><span class="badge b-ok mono">SUCCESS</span></span></div>' +
        '<div class="result-grid">' +
          '<div><div class="small" style="margin-bottom:6px"><span class="badge b-blue">PRB-2001 · SQL 探针</span> <span class="mock-tag">MOCK 生成</span></div>' + U.codeBlock(sqlc) + '</div>' +
          '<div><div class="small" style="margin-bottom:6px"><span class="badge b-teal">PRB-2002 · PYTHON 探针</span> <span class="mock-tag">MOCK 生成</span></div>' + U.codeBlock(pyc) + '</div>' +
        '</div>' +
        '<div class="divider"></div>' +
        '<div class="grid" style="grid-template-columns:1fr 1fr;gap:10px">' +
          '<div class="kn-card done"><div class="k-t">调度计划 <span class="mock-tag">MOCK</span></div><div class="k-meta" style="border:none;padding:0"><span>cron: <b class="mono">0 0 * * *</b>（每天凌晨 00:00）</span><span>next_run: <b class="mono">' + esc(sch.next_run || '2026-10-12 00:00:00') + '</b></span><span>engine: <b>' + esc(sch.engine || 'APScheduler') + '</b></span><span>' + esc(sch.retry_policy || '失败重试 2 次') + '</span></div></div>' +
          '<div class="kn-card done"><div class="k-t">闭环动作</div><div class="k-meta" style="border:none;padding:0"><span>探针已写入 <b>产物探针</b>（RUNNABLE→SCHEDULED）· RULE-0101 关联探针 2→4</span><span>本次调用链已写入 <b>链路追踪</b>（' + S.traces.length + ' 步）</span><span>结果回写 probe_run（调度触发后）</span></div>' +
          '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><a class="btn btn-primary" href="#/probes" style="text-decoration:none;font-size:12px;padding:7px 12px">查看产物探针</a><a class="btn btn-teal" href="#/rules" style="text-decoration:none;font-size:12px;padding:7px 12px">查看规则管理</a><a class="btn btn-ghost" href="#/trace" style="text-decoration:none;font-size:12px;padding:7px 12px">查看 Trace</a></div></div>' +
        '</div>';
    }
    U.$('#chat-stream').appendChild(sum);
    pipe(6, 'done');
  }

  /* ---------- 重置 ---------- */
  function resetBoard(keepTraces) {
    var stream = U.$('#chat-stream');
    if (stream) stream.innerHTML = '';
    stageSeq = 0;
    Demo.aborted = false;
    Demo.genProbes = { sql: null, py: null };
    Demo.genRule = null;
    Demo.schedule = null;
    resetSubtaskProgress();
    buildPipeMini();
    if (!keepTraces && U.$('#trace-live')) {
      U.$('#trace-live').innerHTML = '<div class="trace-empty">运行后实时写入每个 LLM / Tool 调用</div>';
      var c = U.$('#trace-count'); if (c) c.textContent = '0 步';
    }
  }

  R.register('chat', { title: '对话管理', en: 'Conversations · Intent Routing · Runtime', render: renderChat });
  global.DQRuntime = { render: renderChat, Demo: Demo, startRun: startRun };
  console.log('%c[DQ-Prototype] runtime.js 已加载：对话管理（#/chat）双业务活动管线注册', 'color:#4f7cff;font-weight:bold;');
})(window);
