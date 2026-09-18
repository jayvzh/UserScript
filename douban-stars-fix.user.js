// ==UserScript==
// @name         豆瓣星星修复 (Linux 跨域 image-set)
// @namespace    https://novelastrid.github.io/douban-stars-fix
// @version      1.0.0
// @description  修复 Linux 上新内核浏览器(Edge/Chrome/Firefox)豆瓣电影页星级精灵图不显示的问题：将跨域样式表中的 image-set(...dppx) 背景降级为普通 url() 内联背景。支持懒加载短评。
// @author       十一
// @match        *://movie.douban.com/*
// @match        *://*.douban.com/*
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
