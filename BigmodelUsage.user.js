// ==UserScript==
// @name         智谱订阅倒计时
// @namespace    https://docs.scriptcat.org/
// @version      0.4.0
// @description  在周额度/5小时额度的重置时间后显示倒计时
// @author       You
// @match        https://bigmodel.cn/coding-plan/personal/usage
// @icon         data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAACP0lEQVR42u2b3Y3DIAyAGYGne74RGIERWOCkjMImGaEjMEJHyAgZIZeTOCmqAjH4J0nrBz9VJfYXxzbGmK+fxXyyGAWgAEQf6FcJq8QdCfn3twFgs1HjKtMqS4NM+X8hr3MrAD4rvxDKyOUd1IYnYsNfJVGDoFjECRi+B8JdAUBsVPyZld8Lgin/3rJePAuABb71uSOYbYPnDPQGKwnAAaL6n1ID0Xc6AGBPvZ9Ej/HzgSKesYaYDrzNcQI4Mj4KFS+REkLLNz9VHupPqCjnihdaagCpEtXdSXW8q2SNRAkgVoy3iDf4yOs8EB5kKxAiBQBHGXA2xu+t6RGeUPocHBZAIlbWbN78qzyQMaHrU+hZFBvta/mcIzv4XgCpEGHNRQGYQqZKPQA8g+tLAGjWu7TQiEktJwIoee7YAsAWlBtuAmAorG2hAEIh7ZmbADCFtBigAMYWF7ooALAN0EgabgYgQDMYVEF7MwAWuj4kjTyJNzESAExhj+CPAATG9AcB4JHyfZAOwxGAKNDo4O4YDy22vCOAJXvCRwPwVwYwf7oHxCvHAIks8K/cvCmzI0EGIMkCEnWAlHTVARKVoIR0V4ISewEJQe0FuHeDEoLaDXL3AyQE1Q/g7ghxC7ojxN0T5BZ0T5C7K8x9aErSFeY8F+AUsnMBzpMh6bmB7pMhrrNBSddHnQ1ynQ5zzAmwnQ5zzQdQlrys8wE6IaIzQjolpnOCOimqs8I6La73BfTGiN4Z0ltjem9Qb44qAAXwfvILK1IiiSWz9XkAAAAASUVORK5CYII=
// @grant        none
// @noframes
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    var ICON = '<svg width="1em" height="1em" viewBox="0 0 48 48" fill="none" style="vertical-align:-0.125em;margin-right:4px"><path fill-rule="evenodd" clip-rule="evenodd" fill="currentColor" d="M24 2c12.15 0 22 9.85 22 22s-9.85 22-22 22S2 36.15 2 24 11.85 2 24 2zm0 4C14.059 6 6 14.059 6 24s8.059 18 18 18 18-8.059 18-18S33.941 6 24 6zm1 8a1 1 0 011 1v7h7a1 1 0 011 1v2a1 1 0 01-1 1H23a1 1 0 01-1-1V15a1 1 0 011-1h2z"/></svg>';

    // 解析重置时间：完整日期（周额度）或仅 HH:mm（5小时额度，按今天算、已过则顺延明天）
    function parseTime(s) {
        var m = s.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})\D+(\d{1,2}):(\d{2})/);
        if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
        m = s.match(/(\d{1,2}):(\d{2})/);
        if (!m) return null;
        var now = new Date();
        var d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), +m[1], +m[2]);
        if (d <= now) d.setDate(d.getDate() + 1);
        return d;
    }

    // 剩余毫秒 -> X天X小时X分钟后重置
    function format(ms) {
        if (isNaN(ms) || ms <= 0) return '已重置';
        var t = Math.floor(ms / 60000), d = Math.floor(t / 1440), h = Math.floor(t % 1440 / 60);
        return (d ? d + '天' : '') + (d || h ? h + '小时' : '') + t % 60 + '分钟后重置';
    }

    function tick() {
        var els = document.querySelectorAll('.reset-time');
        for (var i = 0; i < els.length; i++) {
            var el = els[i], raw = '';
            // 只拼接直接文本节点（Vue 原文），自动排除本脚本追加的 span
            for (var n = el.firstChild; n; n = n.nextSibling)
                if (n.nodeType === 3) raw += n.nodeValue;

            var t = parseTime(raw);
            if (!t) continue;
            var label = format(t.getTime() - Date.now());

            var tag = el.querySelector('.zs-cd');
            if (tag && tag.dataset.label === label) continue; // 文案没变，不动 DOM
            if (tag) tag.remove();

            tag = document.createElement('span');
            tag.className = 'zs-cd';
            tag.dataset.label = label;
            tag.style.cssText = 'margin-left:12px;white-space:nowrap;font:inherit;color:inherit;';
            tag.innerHTML = ICON + label;
            el.appendChild(tag);
        }
        // 元素还没渲染出来：每秒探测一次（仅查询不写入）；出现后每分钟更新一次
        setTimeout(tick, els.length ? 60000 : 1000);
    }

    tick();
})();
