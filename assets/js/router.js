/* ============================================================
 * router.js — Hash 路由 + 通用 UI 辅助（window.DQRouter / window.DQUI）
 * 视图渲染器由 views.js / config.js / runtime.js 通过
 * DQRouter.register(name, {title, render}) 注册。
 * ============================================================ */
(function (global) {
  'use strict';

  /* ---------------- DQUI：小工具 ---------------- */
  var DQUI = {
    esc: function (s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },
    $: function (sel, root) { return (root || document).querySelector(sel); },
    $$: function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); },
    jsonBlock: function (obj) {
      return '<pre class="code">' + DQUI.esc(JSON.stringify(obj, null, 2)) + '</pre>';
    },
    codeBlock: function (code) {
      return '<pre class="code">' + DQUI.esc(code) + '</pre>';
    },
    sleep: function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); },
    rand: function (min, max) { return Math.floor(min + Math.random() * (max - min)); },
    openDrawer: function (title, bodyHtml) {
      DQUI.$('#dw-title').textContent = title;
      DQUI.$('#dw-body').innerHTML = bodyHtml;
      DQUI.$('#drawer').classList.add('open');
      DQUI.$('#drawer-mask').classList.add('open');
    },
    closeDrawer: function () {
      DQUI.$('#drawer').classList.remove('open');
      DQUI.$('#drawer-mask').classList.remove('open');
    }
  };

  /* ---------------- DQRouter ---------------- */
  var routes = {};       // name -> {title, en, render(el)}
  var order = ['dashboard', 'config', 'chat', 'assets', 'trace'];
  var current = null;

  var Router = {
    register: function (name, def) { routes[name] = def; },
    go: function (name) { location.hash = '#/' + name; },
    current: function () { return current; },
    refresh: function () { render(current || 'dashboard'); },

    start: function () {
      global.addEventListener('hashchange', Router.handle);
      Router.handle();
    },
    handle: function () {
      var name = (location.hash || '#/dashboard').replace(/^#\//, '').split('?')[0];
      /* 扩展 v3 §1：原运行态路由重定向到对话管理（对话即运行态） */
      if (name === 'runtime') { location.hash = '#/chat'; return; }
      if (!routes[name]) name = 'dashboard';
      render(name);
    }
  };

  function render(name) {
    var def = routes[name];
    if (!def) return;
    current = name;
    /* 导航高亮 */
    DQUI.$$('#nav .nav-item').forEach(function (a) {
      a.classList.toggle('active', a.getAttribute('data-route') === name);
    });
    /* 面包屑 */
    DQUI.$('#crumb').innerHTML = DQUI.esc(def.title) + (def.en ? '<em>' + DQUI.esc(def.en) + '</em>' : '');
    /* 视图 */
    var host = DQUI.$('#view');
    host.innerHTML = '';
    def.render(host);
    window.scrollTo(0, 0);
  }

  /* 抽屉全局关闭 */
  document.addEventListener('DOMContentLoaded', function () {
    DQUI.$('#dw-close').addEventListener('click', DQUI.closeDrawer);
    DQUI.$('#drawer-mask').addEventListener('click', DQUI.closeDrawer);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') DQUI.closeDrawer();
    });
    Router.start();
  });

  global.DQUI = DQUI;
  global.DQRouter = Router;
  console.log('%c[DQ-Prototype] router.js 已加载：Hash 路由于 window.DQRouter', 'color:#4f7cff;font-weight:bold;');
})(window);
