// ==UserScript==
// @name         豆瓣星星修复 (Linux)
// @namespace    https://novelastrid.github.io/douban-stars-fix
// @version      1.1.0
// @description  修复 Linux 上新内核浏览器(Edge/Chrome/Firefox)豆瓣电影页星级精灵图不显示的问题：将跨域样式表中的 image-set(...dppx) 背景降级为普通 url() 内联背景。支持懒加载短评。
// @author       JayvZh
// @icon         data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%2064%2064%22%3E%3Crect%20width=%2264%22%20height=%2264%22%20rx=%2214%22%20fill=%22%23219653%22/%3E%3Cpath%20d=%22M32%2012l5.6%2012.1%2013.4%201.6-9.9%209.1%202.6%2013.2L32%2041.6%2020.3%2048l2.6-13.2-9.9-9.1%2013.4-1.6z%22%20fill=%22%23fff%22/%3E%3C/svg%3E
// @homepage     https://scriptcat.org/zh-CN/users/213638
// @supportURL   https://scriptcat.org/zh-CN/users/213638
// @match        *://movie.douban.com/*
// @match        *://*.douban.com/*
// @tag          douban
// @tag          豆瓣
// @run-at       document-idle
// @license      MIT
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const FLAG = '__dbstar_fixed';
  const seen = new WeakSet();

  // 从 image-set(...) 计算值里取出第一个 url(...)（即 1dppx / 1x 的精灵图）
  function firstUrl(bgImage) {
    if (!bgImage || bgImage.indexOf('image-set') === -1) return null;
    const m = bgImage.match(/url\(\s*(['"]?)(.*?)\1\s*\)/);
    return m ? m[2] : null;
  }

  function fixOne(el) {
    if (seen.has(el)) return;
    const cs = getComputedStyle(el);
    const bg = cs.backgroundImage;
    const url = firstUrl(bg);
    if (!url) return;
    seen.add(el);
    // 内联普通 url()，保留原精灵图的 background-position（决定显示几颗星）
    el.style.backgroundImage = `url("${url}")`;
    el.style.backgroundRepeat = cs.backgroundRepeat;
    el.style.backgroundPosition = cs.backgroundPosition;
    el.style.backgroundSize = cs.backgroundSize;
    el[FLAG] = true;
  }

  function scan(root) {
    const scope = root && root.querySelectorAll ? root : document;
    // 只查背景里可能用到评分精灵图的元素；全量扫代价也可接受，这里用常见类名 + 兜底
    const candidates = scope.querySelectorAll(
      '[class*="star"], [class*="rating"], [class*="allstar"], [class*="bigstar"]'
    );
    candidates.forEach(fixOne);
  }

  function boot() {
    scan(document);

    const mo = new MutationObserver((mutations) => {
      for (const mut of mutations) {
        for (const node of mut.addedNodes) {
          if (node.nodeType !== 1) continue;
          fixOne(node);
          if (node.querySelectorAll) scan(node);
        }
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });

    // 短评/影评常翻页或异步重渲染，定期补一轮（低成本）
    let tries = 0;
    const timer = setInterval(() => {
      scan(document);
      if (++tries > 20) clearInterval(timer); // ~40s 后停止轮询，observer 继续兜底
    }, 2000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
