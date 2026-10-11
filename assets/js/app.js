/* ============================================================
 * app.js — 启动引导：顶栏徽章、导航实时状态、全局事件同步
 * 加载顺序最后一站：mock → state → router → views → config → runtime → manage → app
 * ============================================================ */
(function (global) {
  'use strict';
  var S = global.DQState, U = global.DQUI;

  function syncTopbar() {
    /* 顶栏徽章：默认锚定运行态主角「探针生成业务活动」（扩展 v2 §1）；向导新发布的优先展示 */
    var pub = S.businessActivities.filter(function (a) { return a.status === 'PUBLISHED'; });
    var userPub = pub.filter(function (a) { return a.created_by_user; });
    var cur = userPub.length ? userPub[userPub.length - 1]
      : (pub.filter(function (a) { return a.id === 'BA-01'; })[0] || pub[0]);
    var badge = U.$('#agent-badge');
    if (badge && cur) {
      badge.textContent = '业务活动: ' + cur.name + ' · 已发布';
    }
    var tb = U.$('#tenant-badge');
    if (tb) tb.textContent = '租户 ' + S.tenant.id + ' · ' + S.tenant.name + ' · 已开租';
  }

  function syncRunNavBadge() {
    var b = U.$('#nav-run-badge');
    if (!b) return;
    var running = global.DQRuntime && global.DQRuntime.Demo.running;
    if (running) {
      b.style.display = '';
      b.className = 'tag';
      b.style.color = 'var(--teal)';
      b.textContent = S.traces.length + ' steps';
      b.animate ? b.style.animation = 'breathe 1.2s ease-in-out infinite' : null;
    } else if (S.traces.length) {
      b.style.display = '';
      b.className = 'tag';
      b.style.color = 'var(--text-dim)';
      b.textContent = 'T·' + S.traces.length;
      b.style.animation = 'none';
    } else {
      b.style.display = 'none';
    }
  }

  S.on(function (evt) {
    if (evt === 'agents:changed' || evt === 'run:started' || evt === 'run:finished') {
      syncTopbar();
      syncRunNavBadge();
      /* KPI 探针成功率微动效：演示闭环回写 */
      if (evt === 'run:finished') {
        S.kpi.probeSuccessRate = Math.min(99.9, S.kpi.probeSuccessRate + 0.3);
      }
    }
    if (evt === 'trace:added') syncRunNavBadge();
  });

  document.addEventListener('DOMContentLoaded', function () {
    syncTopbar();
    syncRunNavBadge();
    console.log(
      '%c数据质量平台 · 交互原型\n%c配置态 + 运行态 + 编排管理 + 链路追踪 · 外部系统全部 MOCK · file:// 离线可用\n打开控制台可见 [MOCK·系统] 调用日志横幅',
      'font-size:16px;font-weight:bold;color:#4f7cff', 'color:#9fb0d9'
    );
  });

  console.log('%c[DQ-Prototype] app.js 已加载：全部模块就绪', 'color:#4f7cff;font-weight:bold;');
})(window);
