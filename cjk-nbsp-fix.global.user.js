// ==UserScript==
// @name         NexusPHP PT 页面字体间距修复（Linux）
// @namespace    local.eleven.cjk-nbsp-fix
// @version      1.1
// @description  规整汉字之间的空格/nbsp/全角空格，修复老站（NexusPHP 等）硬撑间距在 Linux 下挤压或过宽的问题
// @author       十一
// @homepage     https://scriptcat.org/zh-CN/users/213638
// @supportURL   https://scriptcat.org/zh-CN/users/213638
// @icon         data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%2064%2064%22%3E%3Crect%20width=%2264%22%20height=%2264%22%20rx=%2214%22%20fill=%22%233b5bdb%22/%3E%3Ctext%20x=%2232%22%20y=%2245%22%20font-family=%22sans-serif%22%20font-size=%2240%22%20font-weight=%22700%22%20fill=%22%23fff%22%20text-anchor=%22middle%22%3E%E9%97%B4%3C/text%3E%3C/svg%3E
// @match        *://*/*
// @run-at       document-end
// @grant        GM_addStyle
// ==/UserScript==

(function () {
    'use strict';

    // NexusPHP 系站点通用菜单：padding 统一，文字间距交给脚本规整
    GM_addStyle(`
        #mainmenu li a {
            letter-spacing: normal !important;
            white-space: nowrap !important;
            padding-left: 10px !important;
            padding-right: 10px !important;
        }
        #mainmenu li a img.downarrowpointer { margin-left: 4px; }
    `);

    // 汉字（基本区 + 扩展A + 兼容汉字）
    const CJK = '\\u3400-\\u4DBF\\u4E00-\\u9FFF\\uF900-\\uFAFF';
    // 任何“空白”：普通空格 / tab / nbsp(U+00A0) / 全角空格(U+3000)
    const WS = '[\\u0020\\u0009\\u00A0\\u3000]';
    // 汉字 + 空白序列 + 汉字
    const GAP = new RegExp(`([${CJK}])${WS}+(?=[${CJK}])`, 'g');
    // 仅含空白（含全角/nbsp）的文本节点识别
    const HAS_WS = /[\u00A0\u3000]/;

    const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'NOSCRIPT', 'CODE', 'PRE']);
    const PROCESSED = new WeakSet();

    function normalizeText(text) {
        // 1) 汉字与汉字之间：无论原来是 1 个还是 3 个、nbsp 还是全角，统一成 1 个全角空格
        let out = text.replace(GAP, '$1\u3000');
        // 2) 汉字外侧（紧邻非汉字或在边界）的 nbsp/全角空格一律删除，
        //    避免“&nbsp;候选&nbsp;(2)”被拉宽、首尾出现大空隙
        out = out.replace(new RegExp(`([${CJK}])[\\u00A0\\u3000]+`, 'g'), (m, c, off) => {
            const next = out[off + m.length];
            return next && new RegExp(`[${CJK}]`).test(next) ? m : c;
        });
        out = out.replace(new RegExp(`[\\u00A0\\u3000]+([${CJK}])`, 'g'), (m, c, off) => {
            const prev = out[off - 1];
            return prev && new RegExp(`[${CJK}]`).test(prev) ? m : c;
        });
        return out;
    }

    function processRoot(root) {
        if (!root || PROCESSED.has(root)) return;
        PROCESSED.add(root);
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
                const el = node.parentElement;
                if (!el || SKIP_TAGS.has(el.tagName)) return NodeFilter.FILTER_REJECT;
                if (el.closest('[contenteditable=""],[contenteditable="true"]')) return NodeFilter.FILTER_REJECT;
                const v = node.nodeValue;
                if (!v || !HAS_WS.test(v)) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            }
        });
        const targets = [];
        while (walker.nextNode()) targets.push(walker.currentNode);
        targets.forEach(node => {
            const fixed = normalizeText(node.nodeValue);
            if (fixed !== node.nodeValue) node.nodeValue = fixed;
        });
    }

    processRoot(document.body || document.documentElement);

    let timer = null;
    const pending = [];
    const mo = new MutationObserver(muts => {
        for (const m of muts) {
            m.addedNodes.forEach(n => {
                if (n.nodeType === 1) {
                    if (n.textContent && HAS_WS.test(n.textContent)) pending.push(n);
                } else if (n.nodeType === 3 && n.nodeValue && HAS_WS.test(n.nodeValue)) {
                    if (n.parentElement) pending.push(n.parentElement);
                }
            });
        }
        if (!pending.length) return;
        clearTimeout(timer);
        timer = setTimeout(() => {
            const roots = pending.splice(0).filter(r => r && r.isConnected);
            const uniq = roots.filter((r, i) => !roots.some((o, j) => j < i && o.contains && o.contains(r)));
            uniq.forEach(processRoot);
        }, 80);
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
})();
