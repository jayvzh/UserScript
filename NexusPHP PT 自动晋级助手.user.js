// ==UserScript==
// @name         NexusPHP PT 自动晋级助手
// @namespace    https://github.com/493Arceus/nexusphp-auto-promote
// @version      1.5.13
// @description  自动解析 NexusPHP PT 站点常见问题中的等级晋级/降级规则，根据规则使用魔力值兑换上传/下载量，辅助用户保持分享率并自动晋级
// @author       superuser and Codex
// @license      MIT
//
// @match        *://*/*
// @exclude      *://github.com/*
// @exclude      *://*.github.com/*
// @noframes
//
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_notification
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
//
// @connect      *
// @run-at       document-end
// @supportURL   https://scriptcat.org/zh-CN/script-show-page/7191
//
// @description:zh-CN 自动解析 NexusPHP PT 站点常见问题中的等级晋级/降级规则，根据规则使用魔力值兑换上传/下载量，辅助用户保持分享率并自动晋级
// ==/UserScript==

(function () {
    'use strict';

    // ============================================================
    // 1.  CONFIGURATION
    // ============================================================
    const CONFIG = {
        // 功能开关
        ENABLE_AUTO_EXCHANGE: true,       // 是否启用自动兑换
        ENABLE_DEMOTION_WARNING: true,    // 是否启用降级警告
        ENABLE_PROMOTION_CHECK: true,     // 是否启用晋级提示
        // 兑换策略
        EXCHANGE_STRATEGY: 'balanced',    // 'conservative' | 'balanced' | 'aggressive'
        CONSERVATIVE_BUFFER: 1.05,        // 保守策略：目标分享率 = 要求 * 1.05
        BALANCED_BUFFER: 1.10,            // 平衡策略：目标分享率 = 要求 * 1.10
        AGGRESSIVE_BUFFER: 1.20,          // 激进策略：目标分享率 = 要求 * 1.20
        // 界面
        PANEL_POSITION: 'top-right',      // 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'
        PANEL_OPACITY: 0.95,
        AUTO_HIDE_DELAY: 0,               // 自动隐藏延迟（毫秒），0 表示不隐藏
        // 节流
        STATS_REFRESH_INTERVAL: 60000,    // 状态刷新间隔（毫秒）
        EXCHANGE_COOLDOWN: 10000,         // GGPT 站点限制：10 秒内只能交换一次
        // 自动兑换默认值（均可在设置面板修改）
        AUTO_EXCHANGE_DEFAULTS: {
            autoExchange: false,          // 自动兑换总开关（默认关，需手动开启）
            autoExchangeMode: 'promotion',// 'promotion' 晋级驱动 | 'fixed' 定时定额 | 'amount' 按量完成
            autoExchangeIntervalMin: 60,  // 兑换间隔（分钟）
            autoExchangeFixedGB: 10,      // 定时定额模式：每次兑换 GB 数
            autoExchangeFixedType: 'upload', // 定时定额模式：兑换类型 'upload' | 'download'
            autoExchangeAmountGB: 0,      // 按量完成模式：目标兑换量（GB）
            autoExchangeAmountTierKey: '',// 按量完成模式：站点档位，格式 type:value
            autoExchangeAmountRemainingGB: 0, // 按量完成模式：尚需完成的目标量（GB）
            autoExchangeAmountCompletedGB: 0, // 按量完成模式：已完成的实际兑换量（GB）
            autoExchangeCooldownMode: 'auto', // 'auto' 读取站点提示 | 'manual' 手动填写秒数
            autoExchangeCooldownSeconds: 10,  // 手动冷却时间（秒）
            autoExchangeMaxGBPerRun: 100, // 单次兑换上限（GB，安全保护）
            autoExchangeMinBonusKeep: 0,  // 兑换后保留的最低魔力值
        },
        // 存储键名
        STORAGE_KEYS: {
            RULES: 'NP_RULES',
            USER_STATS: 'NP_USER_STATS',
            LAST_EXCHANGE: 'NP_LAST_EXCHANGE',
            SETTINGS: 'NP_SETTINGS',
            PARSED_FAQ: 'NP_PARSED_FAQ',
        },
    };

    // ============================================================
    // 2.  CONSTANTS & ENUMS
    // ============================================================
    const CLASS_LEVELS = {
        PEASANT: { order: 0, cn: ['出游者', '降级', '新手', 'Peasant'], weight: 0 },
        USER: { order: 1, cn: ['初游者', '用户', 'User'], weight: 1 },
        POWER_USER: { order: 2, cn: ['游侠', 'Power User', 'PU', '中级'], weight: 2 },
        ELITE_USER: { order: 3, cn: ['游戏精通', 'Elite User', 'EU', '高级'], weight: 3 },
        CRAZY_USER: { order: 4, cn: ['游戏大师', 'Crazy User', 'CU', '精英'], weight: 4 },
        INSANE_USER: { order: 5, cn: ['游戏大宗', 'Insane User', 'IU', 'Insane'], weight: 5 },
        VETERAN_USER: { order: 6, cn: ['游戏大神', 'Veteran User', 'VU', '专家', 'Veteran'], weight: 6 },
        EXTREME_USER: { order: 7, cn: ['游戏大仙', 'Extreme User', 'Extreme', '冠军'], weight: 7 },
        ULTIMATE_USER: { order: 8, cn: ['修仙', 'Ultimate User', 'UU', '大师', 'Ultimate'], weight: 8 },
        NEXUS_MASTER: { order: 9, cn: ['游戏帝', 'Nexus Master', 'NM', '传说'], weight: 9 },
        VIP: { order: 10, cn: ['入尘散仙', 'VIP', '贵宾'], weight: 10, special: true },
        UPLOADER: { order: 11, cn: ['Uploader', '发布员'], weight: 11, special: true },
        MODERATOR: { order: 12, cn: ['Moderator', '总版主'], weight: 12, special: true },
        ADMIN: { order: 13, cn: ['Administrator', '管理员', 'Admin'], weight: 13, special: true },
        SYSOP: { order: 14, cn: ['Sysop', '维护人员'], weight: 14, special: true },
        STAFF_LEADER: { order: 15, cn: ['Staff Leader', '站长'], weight: 15, special: true },
    };

    /**
     * 站点专属等级要求。
     * GGPT 数据来源与 PT-depiler 保持一致：站点规则是静态 metadata，用户数据另从登录态页面读取。
     * Source (pinned): https://github.com/pt-plugins/PT-depiler/blob/26eab03daccdb06f6ef6348d3f1f00f02a576468/src/packages/site/definitions/ggpt.ts#L74-L150
     */
    const SITE_LEVEL_METADATA = {
        ggpt: {
            hosts: ['gamegamept.com'],
            version: 'pt-depiler-26eab03d',
            levelRequirements: [
                { id: 0, name: 'User' },
                { id: 1, name: 'Power User', interval: 'P4W', downloaded: '50GB', ratio: 2, seedingBonus: 40000 },
                { id: 2, name: 'Elite User', interval: 'P8W', downloaded: '100GB', ratio: 2.5, seedingBonus: 80000 },
                { id: 3, name: 'Crazy User', interval: 'P15W', downloaded: '300GB', ratio: 3, seedingBonus: 150000 },
                { id: 4, name: 'Insane User', interval: 'P25W', downloaded: '500GB', ratio: 3.5, seedingBonus: 250000 },
                { id: 5, name: 'Veteran User', interval: 'P40W', downloaded: '1TB', ratio: 4, seedingBonus: 400000 },
                { id: 6, name: 'Extreme User', interval: 'P60W', downloaded: '2TB', ratio: 4.5, seedingBonus: 600000, isKept: true },
                { id: 7, name: 'Ultimate User', interval: 'P80W', downloaded: '5TB', ratio: 5, seedingBonus: 800000, isKept: true },
                { id: 8, name: 'Nexus Master', interval: 'P100W', downloaded: '10TB', ratio: 5.5, seedingBonus: 1000000, isKept: true },
            ],
        },
    };

    // 正则表达式模式（用于解析规则）
    const PATTERNS = {
        // 注册时间要求
        REG_TIME: /注册(?:至少|满|超过)?\s*(\d+)\s*(周|周|weeks?|weeks?|天|days?|月|months?)/i,
        // 上传量要求
        UPLOAD_REQ: /上[传傳](?:至少|超过|大于|>=|>)?\s*(\d+(?:\.\d+)?)\s*(TB|GB|MB|TiB|GiB|MiB)?/i,
        // 下载量要求
        DOWNLOAD_REQ: /下[载載](?:至少|超过|大于|>=|>)?\s*(\d+(?:\.\d+)?)\s*(TB|GB|MB|TiB|GiB|MiB)?/i,
        // 分享率要求（包含"大于或等于""大于等于""≥"等变体）
        RATIO_REQ: /分享率(?:大于或等于|大于等于|大于|高于|超过|≥|>=|>)?\s*(\d+(?:\.\d+)?)/i,
        // 分享率降级阈值
        RATIO_DEMOTE: /分享率(?:低于|小于或等于|小于等于|小于|≤|<=|<)?\s*(\d+(?:\.\d+)?)/i,
        // 做种积分要求
        BONUS_REQ: /(?:做种积分|做種積分|Seeding Points?|保种积分|seeding bonus)(?:大于|高于|超过|>=|>|至少)?\s*(\d+(?:\.\d+)?)/i,
        // 通用大小格式
        SIZE_WITH_UNIT: /(\d+(?:\.\d+)?)\s*(TB|GB|MB|TiB|GiB|MiB)/i,
        // 降级关键词
        DEMOTE_KEYWORDS: /降级|demoted?|downgrade|降格/i,
        // 自动提升关键词
        PROMOTE_KEYWORDS: /自动提升|自动升级|promot(?:e|ed|ion)|upgrade/i,
    };

    // ============================================================
    // 3.  UTILITY FUNCTIONS
    // ============================================================

    /** 解析大小字符串为字节数 */
    function parseSize(sizeStr, unit) {
        const val = parseFloat(sizeStr);
        if (isNaN(val)) return 0;
        const u = (unit || 'GB').toUpperCase();
        if (u === 'TB' || u === 'TIB') return val * 1024 * 1024 * 1024 * 1024;
        if (u === 'GB' || u === 'GIB') return val * 1024 * 1024 * 1024;
        if (u === 'MB' || u === 'MIB') return val * 1024 * 1024;
        if (u === 'KB' || u === 'KIB') return val * 1024;
        return val;
    }

    /** 将字节格式化为可读大小 */
    function formatBytes(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
        const k = 1024;
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        const val = (bytes / Math.pow(k, i)).toFixed(2);
        return val + ' ' + units[i];
    }

    /** 格式化百分比 */
    function formatPercent(val) {
        return (val * 100).toFixed(1) + '%';
    }

    /** 将等级名归一化，只用于完整字段值比较，不做全文子串扫描。 */
    function normalizeClassName(text) {
        return String(text || '').toLowerCase().replace(/[\s_\-()（）[\]【】]/g, '');
    }

    /**
     * 精确匹配等级名。允许“游戏大仙 (Extreme User)”这类括号双语值，
     * 但不会把用户名 superuser 或普通正文中的 user 误认成 User。
     */
    function matchClassOrderExact(text) {
        if (!text) return -1;
        const raw = String(text).trim();
        const candidates = [raw]
            .concat(raw.split(/[()（）[\]【】|/]/))
            .map(normalizeClassName)
            .filter(Boolean);
        for (const level of Object.values(CLASS_LEVELS)) {
            for (const name of level.cn) {
                if (candidates.includes(normalizeClassName(name))) return level.order;
            }
        }
        return -1;
    }

    /** 将站点中文等级与脚本中的标准英文等级组合展示。 */
    function formatClassDisplayName(className, classOrder) {
        const current = String(className || '').trim();
        if (!current) return '未知';

        const level = Object.values(CLASS_LEVELS).find(item => item.order === Number(classOrder));
        const englishName = level?.cn?.find(name => /[A-Za-z]/.test(name));
        if (!englishName) return current;

        const normalizedCurrent = normalizeClassName(current);
        const normalizedEnglish = normalizeClassName(englishName);
        if (normalizedCurrent === normalizedEnglish) return englishName;
        if (normalizedCurrent.includes(normalizedEnglish)) return current;
        return `${current}(${englishName})`;
    }

    /** 获取当前域名对应的站点等级 metadata。 */
    function getSiteLevelMetadata(hostname) {
        const host = String(hostname || window.location.hostname || '').toLowerCase();
        return Object.values(SITE_LEVEL_METADATA).find(site =>
            site.hosts.some(domain => host === domain || host.endsWith(`.${domain}`))
        ) || null;
    }

    /** 将 PT-depiler 风格的 levelRequirements 转为本脚本规则结构。 */
    function getCanonicalSiteRules(hostname) {
        const site = getSiteLevelMetadata(hostname);
        if (!site) return [];
        return site.levelRequirements.map(level => {
            const intervalMatch = String(level.interval || '').match(/^P(\d+)W$/i);
            const sizeMatch = String(level.downloaded || '').match(/([\d.]+)\s*(TB|GB|MB|TiB|GiB|MiB)/i);
            const promotion = {};
            if (intervalMatch) promotion.regWeeks = Number(intervalMatch[1]);
            if (sizeMatch) {
                promotion.downloadReq = { value: Number(sizeMatch[1]), unit: sizeMatch[2] };
                promotion.downloadBytes = parseSize(sizeMatch[1], sizeMatch[2]);
            }
            if (Number.isFinite(level.ratio)) promotion.ratioReq = level.ratio;
            if (Number.isFinite(level.seedingBonus)) promotion.bonusReq = level.seedingBonus;
            return {
                className: level.name,
                rawName: level.name,
                order: matchClassOrderExact(level.name),
                promotion,
                demotion: {},
                isPromotable: Object.keys(promotion).length > 0,
                isDemotable: false,
                isKept: !!level.isKept,
                description: 'GGPT site metadata (PT-depiler)',
                source: 'site-metadata',
                sourceVersion: site.version,
            };
        }).filter(rule => rule.order >= 0);
    }

    /** DOM 辅助: 查找包含指定文本的 td.rowhead 的相邻 td（支持传入根文档，如 fetch 解析出的 userdetails 页面） */
    function findRowheadSibling(textPatterns, root) {
        const doc = root || document;
        const rows = doc.querySelectorAll('td.rowhead');
        const normalizedPatterns = textPatterns.map(p => String(p).replace(/[\s:：]/g, '').toLowerCase());

        // 先精确匹配字段名，避免“加入日期说明”等相似标签抢在真实字段之前。
        for (const row of rows) {
            const text = (row.textContent || '').replace(/[\s:：]/g, '').toLowerCase();
            if (normalizedPatterns.includes(text)) return row.nextElementSibling;
        }

        // 兼容少数站点在字段名后附带固定说明，但仍限定在 rowhead 中。
        for (const row of rows) {
            const text = (row.textContent || '').replace(/[\s:：]/g, '').toLowerCase();
            if (normalizedPatterns.some(p => text.startsWith(p))) {
                return row.nextElementSibling;
            }
        }
        return null;
    }

    /**
     * 灵活的日期解析：兼容 NexusPHP 各种日期格式
     * 支持: "2023-01-15 12:30:45" / "2023/01/15" / "2023年1月15日 12时30分" / ISO 字符串
     * @returns {Date|null}
     */
    function parseDateFlexible(text) {
        if (!text) return null;
        const t = String(text).trim();
        if (!t) return null;

        // 带时区的 ISO 时间必须交给原生解析。若落入下面的本地时间正则，
        // 缓存中的 "...Z" 会被误当成本地时间，导致注册时长偏移一个时区。
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})$/i.test(t)) {
            const isoDate = new Date(t);
            return isNaN(isoDate.getTime()) ? null : isoDate;
        }

        // 中文格式: 2023年1月15日 (12时30分45秒 可选)
        let m = t.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?(?:\s*(\d{1,2})\s*[时:：]\s*(\d{1,2})\s*(?:[分:：]\s*(\d{1,2})\s*秒?)?)?/);
        if (m) {
            return createValidatedLocalDate(+m[1], +m[2], +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
        }

        // ISO 风格: 2023-01-15 12:30:45 / 2023.01.15 / 2023/01/15
        m = t.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s]+(\d{1,2})[:：](\d{1,2})(?:[:：](\d{1,2}))?)?/);
        if (m) {
            return createValidatedLocalDate(+m[1], +m[2], +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
        }

        // 兜底: 浏览器原生解析
        const d = new Date(t);
        return isNaN(d.getTime()) ? null : d;
    }

    function createValidatedLocalDate(year, month, day, hour, minute, second) {
        const result = new Date(year, month - 1, day, hour, minute, second);
        return result.getFullYear() === year
            && result.getMonth() === month - 1
            && result.getDate() === day
            && result.getHours() === hour
            && result.getMinutes() === minute
            && result.getSeconds() === second
            ? result
            : null;
    }

    const DAY_MS = 24 * 60 * 60 * 1000;

    function addCalendarDays(date, days) {
        const result = new Date(date.getTime());
        result.setDate(result.getDate() + days);
        return result;
    }

    function addCalendarMonths(date, months) {
        const result = new Date(date.getTime());
        const originalDay = result.getDate();
        result.setDate(1);
        result.setMonth(result.getMonth() + months);
        const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
        result.setDate(Math.min(originalDay, lastDay));
        return result;
    }

    function getCompletedCalendarDays(start, end) {
        if (!start || !end || end <= start) return 0;
        let days = Math.max(0, Math.round(
            (Date.UTC(end.getFullYear(), end.getMonth(), end.getDate())
                - Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) / DAY_MS
        ));
        while (days > 0 && addCalendarDays(start, days) > end) days--;
        while (addCalendarDays(start, days + 1) <= end) days++;
        return days;
    }

    function formatLocalDate(date) {
        const pad = value => String(value).padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    }

    /** 计算两个时刻之间完整经过的日历年、月、日，语义与 PT-depiler 的 duration 展示一致。 */
    function getCalendarDuration(start, end) {
        const startTime = start && typeof start.getTime === 'function' ? start.getTime() : NaN;
        const endTime = end && typeof end.getTime === 'function' ? end.getTime() : NaN;
        if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) {
            return { years: 0, months: 0, days: 0 };
        }

        let cursor = new Date(startTime);
        let years = end.getFullYear() - cursor.getFullYear();
        while (years > 0 && addCalendarMonths(cursor, years * 12) > end) years--;
        cursor = addCalendarMonths(cursor, years * 12);

        let months = (end.getFullYear() - cursor.getFullYear()) * 12 + end.getMonth() - cursor.getMonth();
        while (months > 0 && addCalendarMonths(cursor, months) > end) months--;
        cursor = addCalendarMonths(cursor, months);

        let days = Math.max(0, Math.round(
            (Date.UTC(end.getFullYear(), end.getMonth(), end.getDate())
                - Date.UTC(cursor.getFullYear(), cursor.getMonth(), cursor.getDate())) / DAY_MS
        ));
        while (days > 0 && addCalendarDays(cursor, days) > end) days--;
        while (addCalendarDays(cursor, days + 1) <= end) days++;

        return { years, months, days };
    }

    function formatRegistrationRemaining(duration, lessThanDay = false) {
        const parts = [];
        if (duration.years) parts.push(`${duration.years}年`);
        if (duration.months) parts.push(`${duration.months}个月`);
        if (duration.days) parts.push(`${duration.days}天`);
        return parts.join('') || (lessThanDay ? '不足1天' : '0天');
    }

    /**
     * 计算下一等级的注册时长条件。缺少可靠加入日期时绝不从“现在”起算，
     * 避免产生看似精确但实际错误的倒计时。
     */
    function calculateRegistrationCountdown(joinTime, requiredWeeks, now = new Date()) {
        const joinDate = parseDateFlexible(joinTime);
        const weeks = Number(requiredWeeks);
        const nowTime = now && typeof now.getTime === 'function' ? now.getTime() : NaN;
        if (!joinDate || !Number.isFinite(weeks) || weeks <= 0 || !Number.isFinite(nowTime)) {
            return {
                known: false,
                met: false,
                expectedDate: null,
                targetTimestamp: null,
                remainingDays: null,
                remainingText: '注册时间未知',
            };
        }

        const currentDate = new Date(nowTime);
        const targetDate = addCalendarDays(joinDate, weeks * 7);
        const remainingMs = targetDate.getTime() - currentDate.getTime();
        const met = remainingMs <= 0;
        const duration = met ? { years: 0, months: 0, days: 0 } : getCalendarDuration(currentDate, targetDate);

        return {
            known: true,
            met,
            expectedDate: formatLocalDate(targetDate),
            targetTimestamp: targetDate.getTime(),
            remainingDays: met ? 0 : Math.max(1, Math.ceil(remainingMs / DAY_MS)),
            remainingText: met ? '已达标' : formatRegistrationRemaining(duration, true),
            duration,
        };
    }

    function escapeHTML(value) {
        return String(value ?? '').replace(/[&<>"']/g, char => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        })[char]);
    }

    function formatInteger(value) {
        return Math.round(Number(value) || 0).toLocaleString('zh-CN');
    }

    function formatExchangeEstimateParts(estimate) {
        const parts = [];
        if (estimate?.upload?.runs) {
            parts.push(`上传 ${estimate.upload.actualGB} GB / ${estimate.upload.runs} 次 / ${formatInteger(estimate.upload.cost)} G`);
        }
        if (estimate?.download?.runs) {
            parts.push(`下载 ${estimate.download.actualGB} GB / ${estimate.download.runs} 次 / ${formatInteger(estimate.download.cost)} G`);
        }
        return parts;
    }

    function confirmTimeUnmetExchange({ evaluation, estimate, currentBonus }) {
        const reg = evaluation?.details?.nextPromotion?.regWeeks;
        const timeText = reg?.known
            ? `注册时间还需 ${reg.remainingText}（预计 ${reg.expectedDate} 达标）`
            : '注册时间未知，无法计算还需多久';
        const remainingBonus = Number(currentBonus) - Number(estimate?.totalCost || 0);
        const balanceLines = remainingBonus >= 0
            ? [`预计兑换后剩余：${formatInteger(remainingBonus)} G`]
            : [
                `当前魔力值不足，完成全部计划还差：${formatInteger(-remainingBonus)} G`,
                '确认后会按“先上传、后下载”执行，并在余额不足时停止。',
            ];
        return confirm([
            `${timeText}。`,
            '现在兑换流量后仍不会立即晋级。',
            '',
            ...formatExchangeEstimateParts(estimate),
            `预计总消耗：${formatInteger(estimate?.totalCost)} G`,
            `当前魔力值：${formatInteger(currentBonus)} G`,
            ...balanceLines,
            '',
            '是否仍要继续兑换？',
        ].join('\n'));
    }

    /** DOM 辅助: 查找包含指定文本的元素 */
    function findElementContaining(selector, textPatterns) {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
            const text = el.textContent || '';
            if (textPatterns.some(p => text.includes(p))) {
                return el;
            }
        }
        return null;
    }

    /** DOM 辅助: 查找所有包含指定文本的元素 */
    function findAllElementsContaining(selector, textPatterns) {
        const results = [];
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
            const text = el.textContent || '';
            if (textPatterns.some(p => text.includes(p))) {
                results.push(el);
            }
        }
        return results;
    }

    /** 获取当前 URL 路径 */
    function getPath() {
        return window.location.pathname.split('?')[0].split('#')[0];
    }

    /** 判断是否是 NexusPHP 页面（通过页面特征） */
    function isNexusPHP() {
        // 已知站点使用明确域名 metadata，不需要扫描正文。
        if (getSiteLevelMetadata(window.location.hostname)) return true;

        // 快速检测: 检查页面标题 (NexusPHP 站点通常包含)
        const title = document.title || '';
        if (/Powered by NexusPHP/i.test(title)) return true;

        // 未知站点必须同时具备登录用户区和 NexusPHP 导航结构。
        // 禁止扫描整个 innerHTML：GitHub 等源码页面会展示“NexusPHP”文字，但不是 PT 站。
        const infoBlock = document.getElementById('info_block');
        const userLink = infoBlock && infoBlock.querySelector('a[href*="userdetails.php"][href*="id="]');
        const siteLink = document.querySelector(
            'a[href*="torrents.php"], a[href*="mybonus.php"], a[href*="usercp.php"], a[href*="logout.php"]'
        );
        return !!(infoBlock && userLink && siteLink);
    }

    /** 延迟函数 */
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /** 对象深合并 */
    function deepMerge(target, ...sources) {
        if (!sources.length) return target;
        const source = sources.shift();
        if (source && typeof source === 'object') {
            for (const key in source) {
                if (Object.prototype.hasOwnProperty.call(source, key)) {
                    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                        if (!target[key] || typeof target[key] !== 'object') {
                            target[key] = {};
                        }
                        deepMerge(target[key], source[key]);
                    } else {
                        target[key] = source[key];
                    }
                }
            }
        }
        return deepMerge(target, ...sources);
    }

    // ============================================================
    // 4.  STORAGE LAYER
    // ============================================================

    const Storage = {
        get(key, defaultValue) {
            try {
                const val = GM_getValue(CONFIG.STORAGE_KEYS[key] || key);
                return val !== undefined && val !== null ? JSON.parse(val) : defaultValue;
            } catch (e) {
                return defaultValue;
            }
        },

        set(key, value) {
            try {
                GM_setValue(CONFIG.STORAGE_KEYS[key] || key, JSON.stringify(value));
            } catch (e) {
                console.error('[NP Auto-Promote] Storage.set error:', e);
            }
        },

        delete(key) {
            try {
                GM_deleteValue(CONFIG.STORAGE_KEYS[key] || key);
            } catch (e) {
                console.error('[NP Auto-Promote] Storage.delete error:', e);
            }
        },

        getRules() {
            return this.get('RULES', []);
        },

        setRules(rules) {
            this.set('RULES', rules);
        },

        getUserStats() {
            return this.get('USER_STATS', null);
        },

        setUserStats(stats) {
            this.set('USER_STATS', stats);
        },

        getLastExchange() {
            return this.get('LAST_EXCHANGE', null);
        },

        setLastExchange(time) {
            this.set('LAST_EXCHANGE', time);
        },

        getSettings() {
            // 新版默认值与旧存档深合并，保证新增字段（自动兑换参数）始终存在
            const defaults = {
                ...CONFIG.AUTO_EXCHANGE_DEFAULTS,
                strategy: CONFIG.EXCHANGE_STRATEGY,
                demotionWarning: CONFIG.ENABLE_DEMOTION_WARNING,
                promotionCheck: CONFIG.ENABLE_PROMOTION_CHECK,
                panelPosition: CONFIG.PANEL_POSITION,
            };
            const saved = this.get('SETTINGS', null);
            return saved ? deepMerge(defaults, saved) : defaults;
        },

        setSettings(settings) {
            this.set('SETTINGS', settings);
        },

        getParsedFAQ() {
            return this.get('PARSED_FAQ', null);
        },

        setParsedFAQ(data) {
            this.set('PARSED_FAQ', data);
        },
    };

    /**
     * 已知站点优先使用 PT-depiler 风格的站点 metadata。
     * 不混入旧 FAQ 结果：旧解析器的宽泛分享率正则可能把晋级阈值误当成降级阈值。
     */
    function ensureCanonicalSiteRules() {
        const canonical = getCanonicalSiteRules(window.location.hostname);
        if (canonical.length === 0) return [];

        const merged = canonical;
        Storage.setRules(merged);
        Storage.setParsedFAQ({
            rules: merged,
            parsedAt: Date.now(),
            url: window.location.href,
            source: 'site-metadata',
            sourceVersion: merged[0]?.sourceVersion || '',
        });
        return merged;
    }

    // ============================================================
    // 5.  LOGGING
    // ============================================================

    const Log = {
        prefix: '[NP ⚡]',

        info(...args) {
            console.info(this.prefix, ...args);
        },

        warn(...args) {
            console.warn(this.prefix, ...args);
        },

        error(...args) {
            console.error(this.prefix, ...args);
        },

        debug(...args) {
            console.debug(this.prefix, ...args);
        },
    };

    // ============================================================
    // 6.  STYLES
    // ============================================================

    const STYLES = `
        /* NexusPHP Auto-Promote - Floating Panel */
        #np-panel {
            position: fixed;
            z-index: 99999;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            font-size: 13px;
            line-height: 1.5;
            color: #e0e0e0;
            background: rgba(30, 30, 40, 0.95);
            border: 1px solid rgba(100, 120, 200, 0.3);
            border-radius: 10px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
            backdrop-filter: blur(8px);
            min-width: 280px;
            max-width: 380px;
            user-select: none;
            transition: opacity 0.3s ease, transform 0.3s ease;
        }
        #np-panel.np-top-right { top: 60px; right: 20px; }
        #np-panel.np-top-left { top: 60px; left: 20px; }
        #np-panel.np-bottom-right { bottom: 20px; right: 20px; }
        #np-panel.np-bottom-left { bottom: 20px; left: 20px; }
        #np-panel.np-hidden { opacity: 0; transform: translateY(-10px); pointer-events: none; }

        #np-panel-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 8px 12px;
            background: rgba(50, 55, 80, 0.6);
            border-radius: 10px 10px 0 0;
            cursor: move;
            border-bottom: 1px solid rgba(100, 120, 200, 0.15);
        }
        #np-panel-title {
            font-weight: 600;
            font-size: 13px;
            color: #8ab4f8;
        }
        #np-panel-toggle {
            background: none;
            border: none;
            color: #888;
            cursor: pointer;
            font-size: 16px;
            padding: 0 4px;
            line-height: 1;
        }
        #np-panel-toggle:hover { color: #fff; }
        #np-panel-body {
            padding: 10px 12px;
            max-height: 400px;
            overflow-y: auto;
        }
        #np-panel-body::-webkit-scrollbar { width: 4px; }
        #np-panel-body::-webkit-scrollbar-track { background: transparent; }
        #np-panel-body::-webkit-scrollbar-thumb { background: rgba(100, 120, 200, 0.3); border-radius: 2px; }

        .np-section {
            margin-bottom: 8px;
        }
        .np-section:last-child { margin-bottom: 0; }
        .np-section-title {
            font-size: 11px;
            text-transform: uppercase;
            color: #888;
            margin-bottom: 4px;
            letter-spacing: 0.5px;
        }
        .np-stat-row {
            display: flex;
            justify-content: space-between;
            padding: 2px 0;
        }
        .np-stat-label { color: #aaa; }
        .np-stat-value { color: #e0e0e0; font-weight: 500; }
        .np-stat-value.good { color: #81c995; }
        .np-stat-value.warning { color: #fdd663; }
        .np-stat-value.danger { color: #f28b82; }

        .np-progress-bar {
            height: 4px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 2px;
            margin: 4px 0;
            overflow: hidden;
        }
        .np-progress-fill {
            height: 100%;
            border-radius: 2px;
            transition: width 0.5s ease;
        }
        .np-progress-fill.good { background: #81c995; }
        .np-progress-fill.warning { background: #fdd663; }
        .np-progress-fill.danger { background: #f28b82; }

        .np-btn {
            display: inline-block;
            padding: 4px 12px;
            border: 1px solid rgba(100, 120, 200, 0.4);
            border-radius: 4px;
            background: rgba(60, 70, 120, 0.5);
            color: #8ab4f8;
            cursor: pointer;
            font-size: 12px;
            transition: all 0.2s ease;
        }
        .np-btn:hover {
            background: rgba(60, 70, 120, 0.8);
            border-color: rgba(100, 120, 200, 0.6);
        }
        .np-btn:active { transform: scale(0.97); }
        .np-btn.primary {
            background: rgba(50, 110, 200, 0.6);
            border-color: rgba(50, 110, 200, 0.5);
            color: #fff;
        }
        .np-btn.primary:hover { background: rgba(50, 110, 200, 0.8); }
        .np-btn.danger {
            background: rgba(200, 50, 50, 0.4);
            border-color: rgba(200, 50, 50, 0.4);
            color: #f28b82;
        }
        .np-btn.danger:hover { background: rgba(200, 50, 50, 0.6); }
        .np-btn.success {
            background: rgba(50, 160, 80, 0.4);
            border-color: rgba(50, 160, 80, 0.4);
            color: #81c995;
        }
        .np-btn.success:hover { background: rgba(50, 160, 80, 0.6); }
        .np-btn:disabled {
            opacity: 0.4;
            cursor: not-allowed;
        }

        .np-badge {
            display: inline-block;
            padding: 1px 6px;
            border-radius: 3px;
            font-size: 11px;
            font-weight: 600;
        }
        .np-badge.good { background: rgba(129, 201, 149, 0.2); color: #81c995; }
        .np-badge.warning { background: rgba(253, 214, 99, 0.2); color: #fdd663; }
        .np-badge.danger { background: rgba(242, 139, 130, 0.2); color: #f28b82; }
        .np-badge.info { background: rgba(138, 180, 248, 0.2); color: #8ab4f8; }

        .np-rule-item {
            padding: 4px 0;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }
        .np-rule-item:last-child { border-bottom: none; }
        .np-rule-class { font-weight: 600; color: #8ab4f8; }
        .np-rule-detail { font-size: 12px; color: #aaa; }
        .np-rule-status { text-align: right; }

        .np-notification {
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 100000;
            padding: 12px 20px;
            border-radius: 8px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 14px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
            animation: np-slideIn 0.3s ease;
            pointer-events: none;
        }
        .np-notification.info { background: rgba(30, 60, 120, 0.95); color: #8ab4f8; border: 1px solid rgba(50, 110, 200, 0.4); }
        .np-notification.success { background: rgba(30, 80, 50, 0.95); color: #81c995; border: 1px solid rgba(50, 160, 80, 0.4); }
        .np-notification.warning { background: rgba(80, 70, 30, 0.95); color: #fdd663; border: 1px solid rgba(200, 160, 50, 0.4); }
        .np-notification.error { background: rgba(80, 30, 30, 0.95); color: #f28b82; border: 1px solid rgba(200, 50, 50, 0.4); }

        @keyframes np-slideIn {
            from { opacity: 0; transform: translateX(-50%) translateY(-20px); }
            to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
    `;

    // ============================================================
    // 7.  PAGE DETECTION & ROUTING
    // ============================================================

    /** 获取当前页面类型 */
    function getPageType() {
        const path = getPath();
        const file = path.split('/').pop() || '';

        if (file === 'faq.php') return 'faq';
        if (file === 'index.php' || path === '/' || path === '') return 'index';
        if (file === 'userdetails.php') return 'userdetails';
        if (file === 'mybonus.php' || file === 'bonus.php') return 'bonus';
        return 'other';
    }

    // ============================================================
    // 8.  NOTIFICATION SYSTEM
    // ============================================================

    function showNotification(message, type = 'info', duration = 5000) {
        // 移除旧通知
        const old = document.querySelector('.np-notification');
        if (old) old.remove();

        const el = document.createElement('div');
        el.className = `np-notification ${type}`;
        el.textContent = message;
        document.body.appendChild(el);

        setTimeout(() => {
            if (el.parentNode) {
                el.style.opacity = '0';
                el.style.transition = 'opacity 0.3s ease';
                setTimeout(() => el.remove(), 300);
            }
        }, duration);
    }

    // ============================================================
    // 9.  FAQ PARSER — 解析晋级/降级规则
    // ============================================================

    const FAQParser = {
        /**
         * 从 FAQ 页面解析晋级/降级规则
         * @returns {Array} 规则数组，每个元素包含 className, requirements, demotion, order
         */
        parse() {
            Log.info('开始解析 FAQ 晋级/降级规则...');

            // GGPT 等已知站点的晋级条件来自站点 metadata，不再从 FAQ 宽泛猜测。
            const canonicalRules = getCanonicalSiteRules(window.location.hostname);
            if (canonicalRules.length > 0) {
                const rules = ensureCanonicalSiteRules();
                Log.info(`已加载 ${rules.length} 个站点等级规则`);
                return rules;
            }

            // 尝试找到包含等级规则的表格
            let rules = [];

            // 策略 1: 查找 FAQ 中关于用户等级的问题
            const faqAnswers = this._findFAQAnswers();
            Log.debug(`找到 ${faqAnswers.length} 个 FAQ 答案块`);

            for (const answer of faqAnswers) {
                const text = answer.textContent || '';
                // 检查是否包含等级相关关键词
                if (this._isPromotionRelated(text)) {
                    Log.debug('找到晋级相关 FAQ 内容');
                    const tableRules = this._parseTable(answer);
                    if (tableRules && tableRules.length > 0) {
                        rules = rules.concat(tableRules);
                    } else {
                        // 尝试从纯文本解析
                        const textRules = this._parseText(text);
                        if (textRules && textRules.length > 0) {
                            rules = rules.concat(textRules);
                        }
                    }
                }
            }

            // 策略 2: 直接查找页面中的等级表格
            if (rules.length === 0) {
                Log.debug('FAQ 未找到规则，尝试直接查找等级表格');
                const tables = document.querySelectorAll('table');
                for (const table of tables) {
                    const tableText = table.textContent || '';
                    if (this._isPromotionRelated(tableText)) {
                        const tableRules = this._parseTable(table);
                        if (tableRules && tableRules.length > 0) {
                            rules = rules.concat(tableRules);
                        }
                    }
                }
            }

            // 策略 3: 查找所有包含等级信息的表格行
            if (rules.length === 0) {
                Log.debug('仍无结果，尝试通配查找等级行');
                rules = this._findClassRowsWildcard();
            }

            // 排序（按等级权重）
            rules.sort((a, b) => (a.order || 99) - (b.order || 99));

            // 去重
            rules = this._deduplicate(rules);

            // 过滤掉没有有效晋级/降级数据的条目（保留有下载要求、分享率要求、积分要求、注册时间要求、降级阈值的）
            rules = rules.filter(r =>
                r.promotion?.regWeeks ||
                r.promotion?.downloadBytes ||
                r.promotion?.uploadBytes ||
                r.promotion?.ratioReq ||
                r.promotion?.bonusReq ||
                r.demotion?.ratioDemote
            );

            Log.info(`解析完成，共找到 ${rules.length} 个等级规则`);
            if (rules.length > 0) {
                Storage.setRules(rules);
                Storage.setParsedFAQ({ rules, parsedAt: Date.now(), url: window.location.href });
            }

            return rules;
        },

        /** 查找 FAQ 页面中所有的答案块 */
        _findFAQAnswers() {
            const answers = [];

            // NexusPHP 典型 FAQ 结构：每个 item 是一个问答对
            const items = document.querySelectorAll(
                'span[id^="id"] > b, ' +       // <span id="idX"><b>问题</b></span>
                '.faq_answer, ' +
                'div[id^="faq_"]'
            );

            // 另一种结构：FAQ 的内容在 <br/> 后的文本中
            const allSpans = document.querySelectorAll('span[id^="id"]');

            for (const span of allSpans) {
                // 获取 span 后面的所有 sibling 直到下一个 span
                let sibling = span.nextSibling;
                let content = '';
                while (sibling) {
                    if (sibling.nodeType === Node.ELEMENT_NODE && sibling.tagName === 'SPAN' && sibling.id && sibling.id.startsWith('id')) {
                        break;
                    }
                    if (sibling.nodeType === Node.TEXT_NODE || sibling.nodeType === Node.ELEMENT_NODE) {
                        content += sibling.textContent || '';
                    }
                    // 对于元素节点，检查其内部
                    if (sibling.nodeType === Node.ELEMENT_NODE) {
                        // 如果包含表格，添加到内容中
                        const tables = sibling.querySelectorAll('table');
                        for (const table of tables) {
                            content += ' ' + (table.textContent || '');
                        }
                    }
                    sibling = sibling.nextSibling;
                }
                if (content.trim()) {
                    answers.push({ textContent: content, element: span.parentElement });
                }
            }

            // 也检查 frame/box 内容
            const frames = document.querySelectorAll('.frame, .begin_frame, .faq_question');
            for (const frame of frames) {
                const text = frame.textContent || '';
                if (text.trim()) {
                    answers.push({ textContent: text, element: frame });
                }
            }

            return answers;
        },

        /** 判断文本是否与晋级/降级相关 */
        _isPromotionRelated(text) {
            const keywords = [
                '等级', '用户等级', 'Class', 'class',
                '提升', '晋级', '升级', '降级', 'promot', 'demot',
                'Power User', 'Elite User', 'Crazy User', 'Nexus Master',
                'uploaded', 'downloaded', '分享率', 'ratio',
                '做种积分', 'seed bonus', 'seeding',
                '中级', '高级', '精英', '专家', '冠军', '大师', '传说',
                '注册', '注册时间', 'joined',
            ];
            const lower = text.toLowerCase();
            return keywords.some(kw => lower.includes(kw.toLowerCase()));
        },

        /** 从表格解析等级规则 */
        _parseTable(container) {
            const tables = container.querySelectorAll ? container.querySelectorAll('table') : [];
            const rules = [];

            for (const table of tables) {
                const rows = table.querySelectorAll('tr');
                if (rows.length < 2) continue;

                // 检测表头，找到层级列索引
                const firstRow = rows[0];
                const firstCells = firstRow.querySelectorAll('td, th');
                let hasHeader = false;
                let classIdx = -1;
                let reqIdx = -1;

                for (let i = 0; i < firstCells.length; i++) {
                    const text = (firstCells[i].textContent || '').toLowerCase();
                    if (/等级|class|级别|group|角色|身份/i.test(text)) { classIdx = i; hasHeader = true; }
                    if (/要求|条件|requirement|condition|晋级|提升|升级|规则|降级|说明|privileges?|权限|描述/i.test(text)) { reqIdx = i; hasHeader = true; }
                }

                // 如果没找到表头，根据列数推断列索引（无表头时第一行就是数据）
                if (!hasHeader) {
                    if (firstCells.length >= 3) {
                        classIdx = 0;
                        reqIdx = 2;
                    } else if (firstCells.length >= 2) {
                        classIdx = 0;
                        reqIdx = 1;
                    }
                }

                // 解析数据行（有表头则从第2行开始，无表头则从第1行开始）
                const startRow = hasHeader ? 1 : 0;
                for (let r = startRow; r < rows.length; r++) {
                    const cells = rows[r].querySelectorAll('td');
                    if (cells.length <= Math.max(classIdx, reqIdx)) continue;

                    const className = (cells[classIdx >= 0 ? classIdx : 0].textContent || '').trim();
                    if (!className || className.length > 50) continue;

                    const reqText = reqIdx >= 0 ? (cells[reqIdx].textContent || '').trim() : '';
                    if (!reqText || reqText.length < 10) continue;

                    // 提取每个列的内容用于完整分析
                    const allText = Array.from(cells).map(c => (c.textContent || '').trim()).join(' | ');

                    const parsed = this._extractRequirements(reqText || allText);
                    if (parsed) {
                        parsed.className = this._cleanClassName(className);
                        parsed.rawName = className;
                        parsed.order = this._getClassOrder(parsed.className);
                        rules.push(parsed);
                    }
                }
            }

            return rules;
        },

        /** 从纯文本解析规则 */
        _parseText(text) {
            const rules = [];
            // 按行拆分
            const lines = text.split(/\n|<br\s*\/?>/i);

            let currentClass = null;
            let currentReq = '';

            for (const line of lines) {
                const cleanLine = line.replace(/<[^>]+>/g, '').trim();
                if (!cleanLine) continue;

                // 检测等级名称行（包含 Class 名称的行）
                const classMatch = cleanLine.match(/([A-Za-z\u4e00-\u9fa5]+(?:[\s(][A-Za-z\u4e00-\u9fa5]+)*)\s*(?:\(([A-Za-z\s]+)\))?/);
                if (classMatch && this._isClassKeyword(classMatch[1] || classMatch[2])) {
                    // 保存前一个等级
                    if (currentClass && currentReq) {
                        const parsed = this._extractRequirements(currentReq);
                        if (parsed) {
                            parsed.className = this._cleanClassName(currentClass);
                            parsed.rawName = currentClass;
                            parsed.order = this._getClassOrder(parsed.className);
                            rules.push(parsed);
                        }
                    }
                    currentClass = cleanLine;
                    currentReq = '';
                } else if (currentClass && cleanLine.length > 5) {
                    currentReq += ' ' + cleanLine;
                }
            }

            // 处理最后一个
            if (currentClass && currentReq) {
                const parsed = this._extractRequirements(currentReq);
                if (parsed) {
                    parsed.className = this._cleanClassName(currentClass);
                    parsed.rawName = currentClass;
                    parsed.order = this._getClassOrder(parsed.className);
                    rules.push(parsed);
                }
            }

            return rules;
        },

        /** 从表格行外部的纯文本中查找等级行 */
        _findClassRowsWildcard() {
            const rules = [];
            const bodyText = document.body.textContent || '';

            // 尝试匹配典型的等级描述模式
            // 例如: "中级训练家(PU)" 或 "Power User (PU)"
            const classPatterns = [
                /([A-Za-z\u4e00-\u9fa5]+(?:[（(]\s*[A-Za-z]+\s*[）)])?)\s*[:：]?\s*(.+?)(?=(?:\n\n|$|[A-Za-z\u4e00-\u9fa5]+[（(]\s*[A-Za-z]+\s*[）)]))/g,
                /([A-Za-z\u4e00-\u9fa5]+(?:用户|User|训练家|Master|VIP|Uploader|Moderator))\s*[:：]?\s*(.+?)(?=\n|$)/g,
            ];

            // 直接查找所有包含等级关键词的独立行
            const allText = document.body.innerHTML;
            const tableMatch = allText.match(/<td[^>]*>(.*?)<\/td>/gs);
            if (tableMatch) {
                let classes = [];
                let requirements = [];

                for (let i = 0; i < tableMatch.length; i++) {
                    const cellText = tableMatch[i].replace(/<[^>]+>/g, '').trim();
                    if (!cellText) continue;

                    // 检测等级名
                    if (this._isClassKeyword(cellText)) {
                        classes.push({ index: i, text: cellText });
                    }
                    // 检测要求文本
                    if (/(?:注册|下载|上传|分享率|做种积分|ratio|seed|upload|download)/i.test(cellText) && cellText.length > 15) {
                        requirements.push({ index: i, text: cellText });
                    }
                }

                // 配对等级和要求（基于表格位置）
                if (classes.length > 0 && requirements.length > 0) {
                    for (const cls of classes) {
                        // 找到最近的后续要求
                        const nearestReq = requirements.find(r => r.index > cls.index);
                        if (nearestReq) {
                            const parsed = this._extractRequirements(nearestReq.text);
                            if (parsed) {
                                parsed.className = this._cleanClassName(cls.text);
                                parsed.rawName = cls.text;
                                parsed.order = this._getClassOrder(parsed.className);
                                rules.push(parsed);
                            }
                        }
                    }
                }
            }

            return rules;
        },

        /** 判断文本是否为等级关键词 */
        _isClassKeyword(text) {
            return matchClassOrderExact(text) >= 0;
        },

        /** 从要求文本中提取结构化的条件 */
        _extractRequirements(text) {
            if (!text || text.length < 5) return null;

            const result = {
                raw: text,
                promotion: {},   // { regWeeks, downloadReq, ratioReq, bonusReq }
                demotion: {},    // { ratioDemote }
                isPromotable: false,
                isDemotable: false,
                description: text.substring(0, 200),
            };

            // 检查是否可提升/可降级
            result.isPromotable = PATTERNS.PROMOTE_KEYWORDS.test(text);
            result.isDemotable = PATTERNS.DEMOTE_KEYWORDS.test(text);

            // 注册时间
            const regMatch = text.match(PATTERNS.REG_TIME);
            if (regMatch) {
                let weeks = parseInt(regMatch[1]);
                const unit = (regMatch[2] || '').toLowerCase();
                if (unit.includes('天') || unit.includes('day')) weeks = Math.round(weeks / 7);
                if (unit.includes('月') || unit.includes('month')) weeks = weeks * 4;
                result.promotion.regWeeks = weeks;
            }

            // 下载量要求
            const dlMatch = text.match(PATTERNS.DOWNLOAD_REQ);
            if (dlMatch) {
                const val = parseFloat(dlMatch[1]);
                const unit = dlMatch[2] || 'GB';
                result.promotion.downloadReq = { value: val, unit };
                result.promotion.downloadBytes = parseSize(val, unit);
            }

            // 上传量要求（有些站点用上传代替下载）
            const ulMatch = text.match(PATTERNS.UPLOAD_REQ);
            if (ulMatch) {
                const val = parseFloat(ulMatch[1]);
                const unit = ulMatch[2] || 'GB';
                result.promotion.uploadReq = { value: val, unit };
                result.promotion.uploadBytes = parseSize(val, unit);
            }

            // 分享率要求（晋级）
            const ratioMatch = text.match(PATTERNS.RATIO_REQ);
            if (ratioMatch) {
                result.promotion.ratioReq = parseFloat(ratioMatch[1]);
            }

            // 分享率降级阈值
            const ratioDemoteMatch = text.match(PATTERNS.RATIO_DEMOTE);
            if (ratioDemoteMatch) {
                result.demotion.ratioDemote = parseFloat(ratioDemoteMatch[1]);
                result.isDemotable = true;
            }

            // 做种积分要求
            const bonusMatch = text.match(PATTERNS.BONUS_REQ);
            if (bonusMatch) {
                result.promotion.bonusReq = parseFloat(bonusMatch[1]);
            }

            return result;
        },

        /** 清理等级名称 */
        _cleanClassName(name) {
            return name.replace(/<[^>]+>/g, '').replace(/^\s+|\s+$/g, '');
        },

        /** 获取等级排序权重 */
        _getClassOrder(className) {
            const order = matchClassOrderExact(className);
            return order >= 0 ? order : 99;
        },

        /** 去重 */
        _deduplicate(rules) {
            const seen = new Set();
            return rules.filter(r => {
                const key = r.className + '-' + (r.promotion.downloadBytes || 0) + '-' + (r.promotion.ratioReq || 0);
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
        },
    };

    // ============================================================
    // 10.  USER STATS COLLECTOR — 收集用户当前数据
    // ============================================================

    const UserStats = {
        /** 从页面收集用户状态（异步：本地信息不全时会主动抓取 userdetails 页面补齐） */
        async collect({ forceDetailsRefresh = false } = {}) {
            Log.info('收集用户状态...');
            const cached = Storage.getUserStats() || {};

            const stats = {
                uploaded: 0,
                downloaded: 0,
                ratio: 0,
                bonus: 0,
                seedingBonus: 0,
                className: '',
                classOrder: -1,
                joinTime: null,
                registeredDays: 0,
                hourlyBonus: 0,
                messageCount: 0,
                userId: null,
            };

            // 从 info_block 获取用户 ID
            this._extractUserId(stats);
            // PT-depiler/NexusPHP 流程：当前页无 UID 时先读首页，再请求自己的 userdetails。
            if (!stats.userId) await this._fetchUserIdFromIndex(stats);

            // 从用户详情页或首页提取传输数据
            this._extractTraffic(stats);

            // 提取等级
            this._extractClass(stats);

            // 提取魔力值
            this._extractBonus(stats);

            // 提取注册时间
            this._extractJoinTime(stats);

            // mybonus 等页面通常没有 UID；沿用同一账号的已知 UID，
            // 以便后续只读抓取 userdetails.php 补齐注册时间和做种积分。
            if (!stats.userId && cached.userId) stats.userId = cached.userId;

            // 已知站点默认优先使用用户详情页；用户手动刷新时绕过本地节流，
            // 防止仍停留在旧页面 DOM 时覆盖掉刚验证过的兑换结果。
            const forceAuthoritative = forceDetailsRefresh || !!getSiteLevelMetadata(window.location.hostname);
            await this._maybeFetchUserDetails(stats, forceAuthoritative, forceDetailsRefresh);

            // 个别页面既不含详情字段，也可能没有可用 UID。此时不能把已确认的数据写成 0。
            // 如果当前页面识别到的是另一个 UID，则绝不复用旧账号缓存。
            const sameUser = !cached.userId || !stats.userId || String(cached.userId) === String(stats.userId);
            if (sameUser) {
                if (!stats.uploaded && cached.uploaded) stats.uploaded = cached.uploaded;
                if (!stats.downloaded && cached.downloaded) stats.downloaded = cached.downloaded;
                if (!stats.ratio && cached.ratio) stats.ratio = cached.ratio;
                if (!stats.bonus && cached.bonus) stats.bonus = cached.bonus;
                if (!stats.className && cached.className) {
                    stats.className = cached.className;
                    stats.classOrder = cached.classOrder;
                }
                if (!stats.joinTime && cached.joinTime) stats.joinTime = cached.joinTime;
                if (!stats.seedingBonus && cached.seedingBonus) stats.seedingBonus = cached.seedingBonus;
                if (!stats.lastEvaluation && cached.lastEvaluation) stats.lastEvaluation = cached.lastEvaluation;
            }

            // 计算已注册天数
            if (stats.joinTime) {
                const joinDate = parseDateFlexible(stats.joinTime);
                if (joinDate) {
                    const diff = Date.now() - joinDate.getTime();
                    stats.registeredDays = Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
                }
            }
            if (!stats.registeredDays && sameUser && cached.registeredDays) {
                stats.registeredDays = cached.registeredDays;
            }

            // 计算分享率（如果缺失）
            if (stats.ratio === 0 && stats.downloaded > 0) {
                stats.ratio = stats.uploaded / stats.downloaded;
            } else if (stats.downloaded === 0 && stats.uploaded > 0) {
                stats.ratio = Infinity;
            }

            Log.info('用户状态:', stats);
            Storage.setUserStats(stats);
            return stats;
        },

        /**
         * 当等级/魔力值/注册时间缺失或置信度低时，
         * 主动 fetch 自己的 userdetails.php 页面，在解析后的 DOM 中提取
         */
        async _maybeFetchUserDetails(stats, forceAuthoritative = false, bypassFetchThrottle = false) {
            const needClass = forceAuthoritative || !stats.className || stats.classOrder < 0 || stats.classOrder === 99;
            const needBonus = forceAuthoritative || !stats.bonus;
            const needJoin = forceAuthoritative || !stats.joinTime;
            const needTraffic = forceAuthoritative || (!stats.uploaded && !stats.downloaded);
            if (!needClass && !needBonus && !needJoin && !needTraffic) return;
            if (!stats.userId) {
                Log.warn('无法获取用户 ID，跳过 userdetails 页面抓取');
                return;
            }

            // 5 分钟内不重复抓取，避免频繁请求
            const now = Date.now();
            if (!bypassFetchThrottle && this._lastFetchTime && now - this._lastFetchTime < 300000) return;

            try {
                const url = `/userdetails.php?id=${stats.userId}`;
                Log.info(`读取用户详情页: ${url}`);
                const resp = await fetch(url, {
                    credentials: 'same-origin',
                    cache: forceAuthoritative ? 'no-store' : 'default',
                });
                if (!resp.ok) {
                    Log.warn(`userdetails 页面请求失败: HTTP ${resp.status}`);
                    return;
                }
                if (resp.redirected && /login|verify|checkpoint|returnto/i.test(resp.url || '')) {
                    Log.warn('userdetails 页面被重定向到登录/验证页，保留已有数据');
                    return;
                }
                const html = await resp.text();
                const doc = new DOMParser().parseFromString(html, 'text/html');
                const hasUserDetailsFields = !!findRowheadSibling(['等级', '等級', 'Class', '传输', '傳送', 'Transfers'], doc);
                const isLoginPage = !!doc.querySelector('form[action*="takelogin"], input[name="username"][type="text"]');
                if (isLoginPage || !hasUserDetailsFields) {
                    Log.warn('userdetails 响应不是有效用户详情页，保留已有数据');
                    return;
                }

                if (needTraffic) this._extractTraffic(stats, doc);
                if (needClass) this._extractClass(stats, doc);
                if (needBonus) this._extractBonus(stats, doc);
                if (needJoin) this._extractJoinTime(stats, doc);
                this._lastFetchTime = now;
                stats.detailsFetchedAt = now;
            } catch (e) {
                Log.warn('抓取用户详情页失败:', e && e.message ? e.message : e);
            }
        },

        /** 提取用户 ID */
        _extractUserId(stats, root) {
            const doc = root || document;
            // 方法 1: info_block 中的链接
            const infoLink = doc.querySelector('#info_block a[href*="userdetails.php"][href*="id="]');
            if (infoLink) {
                const match = infoLink.getAttribute('href').match(/id=(\d+)/);
                if (match) stats.userId = parseInt(match[1]);
            }

            // 方法 2: 任意 userdetails 链接
            if (!stats.userId) {
                const anyLink = doc.querySelector('a[href*="userdetails.php"][href*="id="]');
                if (anyLink) {
                    const match = anyLink.getAttribute('href').match(/id=(\d+)/);
                    if (match) stats.userId = parseInt(match[1]);
                }
            }
        },

        /** NexusPHP 通用流程的第一步：从首页 #info_block 获取当前登录用户 ID。 */
        async _fetchUserIdFromIndex(stats) {
            try {
                const resp = await fetch('/index.php', { credentials: 'same-origin' });
                if (!resp.ok) return;
                const html = await resp.text();
                const doc = new DOMParser().parseFromString(html, 'text/html');
                this._extractUserId(stats, doc);
            } catch (e) {
                Log.warn('首页用户 ID 请求失败:', e && e.message ? e.message : e);
            }
        },

        /** 提取传输数据（上传量、下载量、分享率） */
        _extractTraffic(stats, root) {
            const doc = root || document;
            // 方法 1: NexusPHP userdetails 的“传输/Transfers”字段。
            const trafficRow = findRowheadSibling(['传输', '傳送', 'Transfers'], doc);
            if (trafficRow) {
                const text = trafficRow.textContent || '';
                this._parseTrafficText(text, stats);
            }

            // 部分 NexusPHP 主题将上传/下载/分享率合并在 rowfollow 中。
            if ((!stats.uploaded || !stats.downloaded || !stats.ratio) && doc.querySelectorAll) {
                const rowfollows = doc.querySelectorAll('td.rowfollow');
                for (const cell of rowfollows) {
                    const text = cell.textContent || '';
                    if (/分享率|Ratio/i.test(text) && /上[传傳]量|Uploaded/i.test(text)) {
                        this._parseTrafficText(text, stats);
                        break;
                    }
                }
            }

            // 方法 2: 从首页顶部导航或用户栏
            const userInfoStats = doc.querySelector && doc.querySelector('#info_block, .userinfo, .ratio-bar');
            if ((!stats.uploaded || !stats.downloaded || !stats.ratio) && userInfoStats) {
                const text = userInfoStats.textContent || '';
                this._parseTrafficText(text, stats);
            }
        },

        /** 从文本解析传输数据 */
        _parseTrafficText(text, stats) {
            if (!text) return;
            const clean = String(text).replace(/,/g, '');

            // 上传量
            const uploadMatch = clean.match(/(?:上[传傳]量|Uploaded).+?([\d.]+)\s*(TB|GB|MB|TiB|GiB|MiB)/i);
            if (uploadMatch) {
                stats.uploaded = parseSize(uploadMatch[1], uploadMatch[2]);
            }

            // 下载量
            const downloadMatch = clean.match(/(?:下[载載]量|Downloaded).+?([\d.]+)\s*(TB|GB|MB|TiB|GiB|MiB)/i);
            if (downloadMatch) {
                stats.downloaded = parseSize(downloadMatch[1], downloadMatch[2]);
            }

            // 分享率
            const ratioMatch = clean.match(/(?:分享率|Ratio)\s*[：:]?\s*([\d.]+)/i);
            if (ratioMatch) {
                stats.ratio = parseFloat(ratioMatch[1]);
            }
        },

        /** 提取等级 */
        _extractClass(stats, root) {
            const doc = root || document;

            // 方法 1: userdetails 页面中的"等级"行（优先 img 的 title/alt，其次文本）
            const classCell = findRowheadSibling(['等级', '等級', 'Class'], doc);
            if (classCell) {
                const img = classCell.querySelector('img[title], img[alt]');
                const label = img
                    ? (img.getAttribute('title') || img.getAttribute('alt') || '').trim()
                    : (classCell.textContent || '').trim();
                if (label && this._matchClassOrder(label) >= 0) {
                    stats.className = label;
                    this._setClassOrder(stats);
                    return;
                }
            }

            // 方法 2: info_block 内提取
            const infoBlock = doc.querySelector ? doc.querySelector('#info_block') : null;
            if (infoBlock) {
                // 2a: 用户名链接的 class 命名规则 "XxxUser_Name"（GGPT 等站，如 ExtremeUser_Name → Extreme User）
                const ownSelector = stats.userId
                    ? `a[href*="userdetails.php"][href*="id=${stats.userId}"]`
                    : 'a[href*="userdetails.php"][href*="id="]';
                const userLink = infoBlock.querySelector(ownSelector);
                if (userLink && userLink.className) {
                    const classToken = String(userLink.className).split(/\s+/).find(token => /_Name$/i.test(token));
                    const levelName = classToken ? classToken.replace(/_Name$/i, '') : '';
                    if (levelName && this._matchClassOrder(levelName) >= 0) {
                        stats.className = levelName;
                        this._setClassOrder(stats);
                        return;
                    }
                }
                // 2b: 等级图标（部分站点在用户名旁显示等级图片）
                const imgs = infoBlock.querySelectorAll('img[title], img[alt]');
                for (const img of imgs) {
                    const label = (img.getAttribute('title') || img.getAttribute('alt') || '').trim();
                    if (label && this._matchClassOrder(label) >= 0) {
                        stats.className = label;
                        this._setClassOrder(stats);
                        return;
                    }
                }
            }
            // 注意：不再做全文文本扫描 —— 页面上"用户""User"等字样无处不在，
            // 旧实现按 CLASS_LEVELS 顺序第一个就命中 USER，导致等级几乎总是被误判为 User
        },

        /**
         * 判断文本匹配哪个等级，返回 order；未匹配返回 -1
         * 对结构化字段值做精确匹配；允许括号中的中英文别名，禁止正文子串匹配。
         */
        _matchClassOrder(text) {
            return matchClassOrderExact(text);
        },

        /** 设置等级排序权重 */
        _setClassOrder(stats) {
            if (!stats.className) {
                stats.classOrder = -1;
                return;
            }
            const order = this._matchClassOrder(stats.className);
            stats.classOrder = order >= 0 ? order : 99;
        },

        /** 提取魔力值 */
        _extractBonus(stats, root) {
            const doc = root || document;

            // 方法 1: userdetails 页面 rowhead 旁的魔力值
            const bonusRow = findRowheadSibling(['魔力值', '魔力', 'Karma'], doc);
            if (bonusRow) {
                const m = (bonusRow.textContent || '').match(/([\d,]+(?:\.\d+)?)/);
                if (m) stats.bonus = parseFloat(m[1].replace(/,/g, ''));
            }

            // 方法 2: 顶栏 #info_block / mybonus 链接附近
            // NexusPHP 顶栏典型结构: <a href="mybonus.php">魔力值</a>: 1,234.5 —— 数字在链接外的文本节点
            if (!stats.bonus) {
                const scopes = [];
                const infoBlock = doc.querySelector ? doc.querySelector('#info_block') : null;
                if (infoBlock) scopes.push(infoBlock);
                const bonusLink = doc.querySelector ? doc.querySelector('a[href*="mybonus.php"], a[href*="bonus.php"]') : null;
                if (bonusLink && bonusLink.parentElement) scopes.push(bonusLink.parentElement);

                for (const scope of scopes) {
                    const text = (scope.textContent || '').replace(/\s+/g, ' ');
                    // 冒号可选，兼容 "魔力值 1,234.5" / "魔力值 : 1,234.5" / "魔力值(1,234.5)"
                    // 以及 GGPT 顶栏 "G值 [使用]: 3,163,332.8"（关键词与数字间隔着方括号链接）
                    const m = text.match(/(?:魔力值|魔力|Karma|Bonus|G\s*值)\s*(?:\[[^\]]{0,8}\]\s*)?[：:：]?\s*[\[(]?\s*([\d,]+(?:\.\d+)?)/i);
                    if (m) {
                        stats.bonus = parseFloat(m[1].replace(/,/g, ''));
                        break;
                    }
                }
            }

            // 方法 3: 全局扫描兜底 —— 句式优先，防误匹配兑换价格表
            // mybonus 页典型句式: "你现在有 1,234.5 个魔力值"（数字在关键词前）
            // 价格表干扰项: "500 魔力值 = 1GB"、"1GB 需要 500 魔力值"（不能匹配）
            if (!stats.bonus) {
                const bodyText = ((doc.body || doc.documentElement).textContent || '').replace(/\s+/g, ' ');
                const candidates = [
                    // GGPT mybonus 正文: "用你的魔力值（当前3,163,332.8）换东东"
                    /魔力值[（(]\s*当前\s*([\d,]+(?:\.\d+)?)\s*[)）]/,
                    // 句式 A: "你有/当前有/现在有/剩余 X 个魔力值"、"当前魔力值为 X"
                    /(?:你有|当前有|现在有|现有|剩余|你的魔力值|我的魔力值|当前魔力值)\s*(?:为|是|[:：])?\s*([\d,]+(?:\.\d+)?)\s*(?:个|点|枚)?/,
                    // 句式 B: "1,234.5 个魔力值"（带量词"个/点/枚"的几乎不会是价格表）
                    /([\d,]+(?:\.\d+)?)\s*(?:个|点|枚)\s*魔力值/,
                    // 句式 C: "魔力值: X"（冒号后紧跟数字，且数字后不是 = /GB，排除价格写法）
                    /(?:魔力值|魔力)\s*[:：]\s*([\d,]+(?:\.\d+)?)(?![\d.,]*\s*(?:[=个/]|魔力|GB|GiB|上传|兑换))/,
                    // 句式 D: "G值 [使用]: X"（GGPT 顶栏）
                    /G\s*值\s*(?:\[[^\]]{0,8}\]\s*)?[：:：]\s*([\d,]+(?:\.\d+)?)/,
                ];
                for (const p of candidates) {
                    const m = bodyText.match(p);
                    if (m) {
                        const val = parseFloat(m[1].replace(/,/g, ''));
                        if (val > 0) {
                            stats.bonus = val;
                            break;
                        }
                    }
                }
            }

            // 做种积分（独立字段，userdetails 页面）
            const seedBonusRow = findRowheadSibling(['做种积分', 'Seeding Points', '做種積分', '保种积分'], doc);
            if (seedBonusRow) {
                const m = (seedBonusRow.textContent || '').match(/([\d,]+(?:\.\d+)?)/);
                if (m) stats.seedingBonus = parseFloat(m[1].replace(/,/g, ''));
            }
        },

        /** 提取注册时间 */
        _extractJoinTime(stats, root) {
            const doc = root || document;
            const joinRow = findRowheadSibling(
                ['加入日期', '加入时间', '注册日期', '注册时间', 'Join date', 'Joined'],
                doc
            );
            if (joinRow) {
                // NexusPHP 常用 <span title="2023-01-15 12:30:45">3 年前</span> 显示相对时间，
                // 绝对时间在 title 属性里，优先读取
                const titled = joinRow.querySelector('span[title], time[title]');
                const raw = (titled && titled.getAttribute('title'))
                    || (joinRow.textContent || '').split(' (')[0].trim();
                const d = parseDateFlexible(raw);
                if (d) {
                    stats.joinTime = d.toISOString();
                    return;
                }
                // 解析失败也保留原文，避免完全丢失
                const fallback = (joinRow.textContent || '').trim();
                if (fallback) stats.joinTime = fallback;
            }
        },
    };

    // ============================================================
    // 11.  RULE ENGINE — 比较当前状态与规则
    // ============================================================

    const RuleEngine = {
        /**
         * 评估用户状态与规则的匹配情况
         * @returns {Object} 评估结果
         */
        evaluate() {
            const rules = Storage.getRules();
            const stats = Storage.getUserStats();

            if (!rules || rules.length === 0) {
                return { status: 'no-rules', message: '尚未解析晋级规则，请访问 FAQ 页面', needsExchange: false };
            }
            if (!stats) {
                return { status: 'no-stats', message: '无法获取用户数据', needsExchange: false };
            }

            const result = {
                status: 'ok',
                currentClass: stats.className,
                currentOrder: stats.classOrder,
                nextClass: null,
                prevClass: null,
                promotionStatus: null,  // 'met' | 'close' | 'far' | null
                demotionStatus: null,   // 'safe' | 'warning' | 'danger' | null
                needsExchange: false,
                exchangeReason: null,
                exchangeAmount: 0,       // 需要兑换的上传量（字节）
                exchangeType: null,      // 'upload' | 'download'
                messages: [],
                details: {},
            };

            // 找到当前等级在规则中的索引
            const currentIdx = rules.findIndex(r => r.order === stats.classOrder);
            const statsClassRecognized = stats.classOrder >= 0 && stats.classOrder !== 99;
            // 等级是否成功识别（-1 = 未获取到，99 = 获取到但无法匹配规则表），
            // 同时必须在 FAQ 规则中找到同一 order 才能进行晋级/降级评估。
            const classIdentified = statsClassRecognized && currentIdx >= 0;
            const nextRule = currentIdx >= 0 && currentIdx < rules.length - 1 ? rules[currentIdx + 1] : null;
            const prevRule = currentIdx > 0 ? rules[currentIdx - 1] : null;

            // 找到降级规则（比当前等级低的最高等级）—— 等级未识别时不做降级判断，
            // 否则 classOrder=99 会把所有规则都当作"比当前低"，拿最高等级的阈值误报降级风险
            const demotionCandidates = rules.filter(r => r.order < stats.classOrder);
            const demotionRule = classIdentified && demotionCandidates.length > 0 ? demotionCandidates[demotionCandidates.length - 1] : null;

            // 等级未识别时给出明确提示，而不是误报"最高等级"或"降级风险"
            if (!statsClassRecognized) {
                result.messages.push('❓ 未能识别当前等级，无法评估晋级/降级。请访问你的用户详情页 (userdetails.php) 后点击面板"刷新"');
            } else if (currentIdx < 0) {
                result.messages.push(`❓ 已识别当前等级“${stats.className}”，但 FAQ 规则中没有对应等级。请在 FAQ 页面重新解析规则后再刷新。`);
            }

            result.nextClass = nextRule;
            result.prevClass = demotionRule;

            // ---- 降级检查 ----
            if (demotionRule && demotionRule.demotion && demotionRule.demotion.ratioDemote) {
                const threshold = demotionRule.demotion.ratioDemote;
                const ratio = stats.ratio === Infinity ? 999 : stats.ratio;

                if (ratio <= threshold) {
                    result.demotionStatus = 'danger';
                    result.messages.push(`⚠️ 分享率 ${stats.ratio.toFixed(3)} 已低于降级阈值 ${threshold}，有降级风险！`);
                    result.needsExchange = true;
                    result.exchangeReason = 'demotion';
                    result.exchangeType = 'upload';

                    // 计算需要兑换多少上传量来提升分享率
                    const targetRatio = threshold * 1.15; // 目标分享率比阈值高 15%
                    const neededUpload = Math.ceil(stats.downloaded * targetRatio - stats.uploaded);
                    result.exchangeAmount = Math.max(neededUpload, 0);
                } else if (ratio <= threshold * 1.15) {
                    result.demotionStatus = 'warning';
                    result.messages.push(`⚠️ 分享率 ${stats.ratio.toFixed(3)} 接近降级阈值 ${threshold}`);
                    result.needsExchange = true;
                    result.exchangeReason = 'demotion-prevent';
                    result.exchangeType = 'upload';
                    const targetRatio = threshold * 1.3;
                    const neededUpload = Math.ceil(stats.downloaded * targetRatio - stats.uploaded);
                    result.exchangeAmount = Math.max(neededUpload, 0);
                } else {
                    result.demotionStatus = 'safe';
                }
            } else {
                result.demotionStatus = 'safe';
            }

            // ---- 晋级检查 ----
            if (nextRule && nextRule.promotion) {
                const prom = nextRule.promotion;
                const GB = 1024 * 1024 * 1024;
                let allMet = true;
                let closeCount = 0;
                const nextPromo = {};

                // 检查注册时间
                if (prom.regWeeks) {
                    const countdown = calculateRegistrationCountdown(stats.joinTime, prom.regWeeks);
                    const joinDate = countdown.known ? parseDateFlexible(stats.joinTime) : null;
                    const regWeeks = joinDate
                        ? Math.floor(getCompletedCalendarDays(joinDate, new Date()) / 7)
                        : 0;
                    nextPromo.regWeeks = {
                        required: prom.regWeeks,
                        current: regWeeks,
                        met: countdown.met,
                        known: countdown.known,
                        remainingDays: countdown.remainingDays,
                        remainingText: countdown.remainingText,
                        expectedDate: countdown.expectedDate,
                        targetTimestamp: countdown.targetTimestamp,
                    };
                    if (!nextPromo.regWeeks.met) allMet = false;
                    if (countdown.known && regWeeks >= prom.regWeeks * 0.85) closeCount++;
                }

                // 检查下载量
                if (prom.downloadBytes) {
                    const dlGB = stats.downloaded / GB;
                    const reqGB = prom.downloadBytes / GB;
                    nextPromo.downloadReq = { required: reqGB, current: dlGB, met: stats.downloaded >= prom.downloadBytes };
                    if (!nextPromo.downloadReq.met) allMet = false;
                    if (stats.downloaded >= prom.downloadBytes * 0.85) closeCount++;
                }

                // 检查上传量
                if (prom.uploadBytes) {
                    const ulGB = stats.uploaded / GB;
                    const reqGB = prom.uploadBytes / GB;
                    nextPromo.uploadReq = { required: reqGB, current: ulGB, met: stats.uploaded >= prom.uploadBytes };
                    if (!nextPromo.uploadReq.met) allMet = false;
                    if (stats.uploaded >= prom.uploadBytes * 0.85) closeCount++;
                }

                // 检查分享率
                if (prom.ratioReq) {
                    const ratio = stats.ratio === Infinity ? 999 : stats.ratio;
                    nextPromo.ratioReq = { required: prom.ratioReq, current: ratio, met: ratio >= prom.ratioReq };
                    if (!nextPromo.ratioReq.met) allMet = false;
                    if (ratio >= prom.ratioReq * 0.85) closeCount++;
                }

                // 检查做种积分
                if (prom.bonusReq) {
                    nextPromo.bonusReq = { required: prom.bonusReq, current: stats.seedingBonus, met: stats.seedingBonus >= prom.bonusReq };
                    if (!nextPromo.bonusReq.met) allMet = false;
                    if (stats.seedingBonus >= prom.bonusReq * 0.85) closeCount++;
                }

                result.details.nextPromotion = nextPromo;

                if (allMet) {
                    result.promotionStatus = 'met';
                    result.messages.push(`✅ 已达到 "${nextRule.className}" 的晋级条件！`);
                } else {
                    result.promotionStatus = closeCount >= Math.max(1, Object.keys(prom).length - 1) ? 'close' : 'far';

                    // ---- 晋级兑换计划：算出流量类条件的缺口，直接兑换补足 ----
                    // 非流量条件（注册时间/做种积分）不达标时，兑换流量也无法立即晋级
                    const blockedByTime = prom.regWeeks && !nextPromo.regWeeks.met;
                    const blockedByBonus = prom.bonusReq && !nextPromo.bonusReq.met;

                    // 1) 下载量缺口 → 兑换下载量
                    let downloadGB = 0;
                    if (prom.downloadBytes && stats.downloaded < prom.downloadBytes) {
                        downloadGB = Math.ceil((prom.downloadBytes - stats.downloaded) / GB);
                    }
                    // 2) 上传量缺口 = max(上传量要求缺口, 分享率要求缺口)
                    //    分享率缺口基于"兑换下载量之后"的下载量计算（兑下载量会拉低分享率）
                    let uploadGB = 0;
                    if (prom.uploadBytes && stats.uploaded < prom.uploadBytes) {
                        uploadGB = Math.ceil((prom.uploadBytes - stats.uploaded) / GB);
                    }
                    if (prom.ratioReq) {
                        const projectedDownloaded = stats.downloaded + downloadGB * GB;
                        const neededUpload = prom.ratioReq * projectedDownloaded - stats.uploaded;
                        if (neededUpload > 0) {
                            uploadGB = Math.max(uploadGB, Math.ceil(neededUpload / GB));
                        }
                    }

                    if (downloadGB > 0 || uploadGB > 0) {
                        result.exchangePlan = {
                            downloadGB,
                            uploadGB,
                            blockedByTime: !!blockedByTime,
                            blockedByBonus: !!blockedByBonus,
                            // 注册时间不足允许用户手动确认后提前兑换；做种积分不足仍保持阻止。
                            requiresTimeConfirmation: !!blockedByTime,
                            blocked: !!blockedByBonus,
                        };
                        const parts = [];
                        if (downloadGB > 0) parts.push(`下载量 ${downloadGB} GB`);
                        if (uploadGB > 0) parts.push(`上传量 ${uploadGB} GB`);
                        if (blockedByTime) parts.push('（另需注册时间达标）');
                        if (blockedByBonus) parts.push('（另需做种积分达标）');
                        result.messages.push(`🎯 距 "${nextRule.className}" 晋级缺口: ${parts.join(' + ')}`);

                        if (!blockedByBonus) {
                            result.needsExchange = true;
                            result.exchangeReason = 'promotion';
                            // 兼容旧字段：主类型取缺口更大的
                            result.exchangeType = uploadGB >= downloadGB ? 'upload' : 'download';
                            result.exchangeAmount = Math.max(uploadGB, downloadGB) * GB;
                            if (blockedByTime) {
                                result.messages.push('ℹ️ 注册时间尚未达标；可提前兑换流量，但执行前必须确认，兑换后仍不会立即晋级');
                            }
                        } else {
                            result.messages.push('ℹ️ 做种积分未达标，兑换流量暂无法晋级，请先补齐积分条件');
                        }
                    } else {
                        result.messages.push(`ℹ️ 距 "${nextRule.className}" 晋级仅差非流量条件（注册时间/积分），无需兑换`);
                    }
                }
            } else if (!nextRule && classIdentified) {
                result.promotionStatus = 'max';
                result.messages.push('🏆 已达到最高等级！');
            }

            // ---- 兑换建议 ----
            if (result.needsExchange && result.exchangePlan) {
                const p = result.exchangePlan;
                const parts = [];
                if (p.downloadGB > 0) parts.push(`下载量 ${p.downloadGB} GB`);
                if (p.uploadGB > 0) parts.push(`上传量 ${p.uploadGB} GB`);
                result.messages.push(`💡 建议兑换: ${parts.join(' + ')}（当前剩余魔力值: ${stats.bonus?.toFixed(0) || '未知'}）`);
            } else if (result.needsExchange && result.exchangeAmount > 0) {
                const amountGB = result.exchangeAmount / (1024 * 1024 * 1024);
                result.messages.push(`💡 建议兑换 ${amountGB.toFixed(2)} GB 上传量以提升分享率（当前剩余魔力值: ${stats.bonus?.toFixed(0) || '未知'}）`);
            }

            // 更新存储
            Storage.setUserStats({ ...stats, lastEvaluation: result });

            return result;
        },
    };

    // ============================================================
    // 12.  BONUS EXCHANGE HANDLER — 魔力值兑换
    // ============================================================

    const BonusExchange = {
        /** 检查是否在冷却中 */
        isOnCooldown() {
            const last = Storage.getLastExchange();
            if (!last) return false;
            return (Date.now() - last) < CONFIG.EXCHANGE_COOLDOWN;
        },

        /** 获取距冷却结束的时间（毫秒） */
        getCooldownRemaining() {
            const last = Storage.getLastExchange();
            if (!last) return 0;
            const remaining = CONFIG.EXCHANGE_COOLDOWN - (Date.now() - last);
            return Math.max(0, remaining);
        },

        getCooldownReason() {
            const remainingMs = this.getCooldownRemaining();
            return remainingMs < 60000
                ? `冷却中（剩余 ${Math.ceil(remainingMs / 1000)} 秒）`
                : `冷却中（剩余 ${Math.ceil(remainingMs / 60000)} 分钟）`;
        },

        /** 读取服务器当前 G 值；不信任当前停留页面的旧 DOM。 */
        async _fetchCurrentBonus(cacheKey = 'np_bonus', nonce = Date.now()) {
            try {
                const bonusUrl = new URL('mybonus.php', window.location.href);
                bonusUrl.searchParams.set(cacheKey, String(nonce));
                const response = await fetch(bonusUrl.href, {
                    credentials: 'same-origin',
                    cache: 'no-store',
                });
                if (!response.ok) return null;
                const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
                const stats = { bonus: 0 };
                UserStats._extractBonus(stats, doc);
                return Number.isFinite(stats.bonus) && stats.bonus > 0 ? stats.bonus : null;
            } catch (e) {
                Log.warn('读取服务器当前魔力值失败:', e);
                return null;
            }
        },

        /**
         * GGPT 的 POST 返回页可能仍是提交前的旧余额；必须再发一次禁缓存 GET，
         * 读取服务器最新 G 值后才能判断兑换是否真正完成。
         */
        async _verifyBonusDeduction(beforeBonus, result, expectedCost = 0) {
            if (!result.success) return result;
            if (!Number.isFinite(beforeBonus) || beforeBonus <= 0) {
                return { success: false, reason: '无法读取兑换前的魔力值，未确认兑换成功' };
            }
            try {
                for (let attempt = 0; attempt < 3; attempt++) {
                    const afterBonus = await this._fetchCurrentBonus('np_verify', `${Date.now()}-${attempt}`);
                    if (afterBonus === null) {
                        return { success: false, reason: '无法从站点返回页确认魔力值扣减' };
                    }
                    if (afterBonus < beforeBonus) {
                        const deducted = beforeBonus - afterBonus;
                        // 站点余额只显示到 0.1 G，且后台结算可能产生极小残差。
                        // 对 10,000 G 档最多接受 1 G；较低档最多接受 0.2 G，绝不放宽为大额百分比。
                        const tolerance = Math.max(0.2, Math.min(1, Number(expectedCost) * 0.0001));
                        if (expectedCost > 0 && Math.abs(deducted - expectedCost) > tolerance) {
                            return {
                                success: false,
                                uncertain: true,
                                afterBonus,
                                reason: `G值实际减少 ${deducted.toFixed(1)}，与本档应扣 ${expectedCost} 不一致；已停止循环以避免重复兑换`,
                            };
                        }
                        const costDelta = expectedCost > 0 ? deducted - expectedCost : 0;
                        const accountingWarning = Math.abs(costDelta) > 0.1;
                        if (accountingWarning) {
                            Log.warn(`站点余额核验存在 ${costDelta.toFixed(1)} G 小额残差，按已完成处理`);
                        }
                        return { ...result, afterBonus, deducted, costDelta, accountingWarning };
                    }
                    if (attempt < 2) await sleep((attempt + 1) * 500);
                }
                return {
                    success: false,
                    cooldown: true,
                    reason: '站点未扣除魔力值，可能仍在 10 秒兑换冷却中',
                };
            } catch (e) {
                Log.warn('核验兑换结果失败:', e);
                return { success: false, reason: '无法核验站点兑换结果' };
            }
        },

        /** 按真实 100 GB 档位估算单类兑换；与实际循环使用完全相同的取整规则。 */
        _estimateRepeatedCost(parsed, type, targetGB) {
            const normalizedTarget = Math.max(0, Number(targetGB) || 0);
            if (!normalizedTarget) {
                return { success: true, runs: 0, targetGB: 0, actualGB: 0, unitCost: 0, cost: 0 };
            }
            const tier = parsed?.tiers?.find(t => t.type === type && Math.abs(t.gb - 100) < 0.001);
            if (!tier) {
                return {
                    success: false,
                    reason: `站点没有 100 GB ${type === 'download' ? '下载量' : '上传量'}兑换档位`,
                };
            }
            const runs = Math.ceil(normalizedTarget / 100);
            return {
                success: true,
                runs,
                targetGB: normalizedTarget,
                actualGB: runs * 100,
                unitCost: tier.cost,
                cost: runs * tier.cost,
            };
        },

        _estimatePlanCost(parsed, plan) {
            const upload = this._estimateRepeatedCost(parsed, 'upload', plan?.uploadGB || 0);
            if (!upload.success) return upload;
            const download = this._estimateRepeatedCost(parsed, 'download', plan?.downloadGB || 0);
            if (!download.success) return download;
            return {
                success: true,
                upload,
                download,
                totalCost: upload.cost + download.cost,
                totalRuns: upload.runs + download.runs,
                totalActualGB: upload.actualGB + download.actualGB,
            };
        },

        _estimateCache: null,

        /** 读取站点当前档位，供面板展示晋级方案预计魔力值。 */
        async estimatePromotionPlan(evaluation = RuleEngine.evaluate()) {
            const plan = evaluation?.exchangePlan;
            if (!plan || (!plan.uploadGB && !plan.downloadGB)) {
                return { success: false, reason: '当前没有需要兑换的流量缺口' };
            }
            const knownBonus = Math.round(Number(Storage.getUserStats()?.bonus) || 0);
            const cacheKey = `${window.location.hostname}:${plan.uploadGB || 0}:${plan.downloadGB || 0}:${knownBonus}`;
            if (this._estimateCache
                && this._estimateCache.key === cacheKey
                && Date.now() - this._estimateCache.time < 30000) {
                return this._estimateCache.value;
            }
            const parsed = await this._getTiers();
            if (!parsed) return { success: false, reason: '无法读取站点兑换档位' };
            const estimate = this._estimatePlanCost(parsed, plan);
            const value = {
                ...estimate,
                pageBonus: parsed.pageBonus || 0,
                plan,
            };
            this._estimateCache = { key: cacheKey, time: Date.now(), value };
            return value;
        },

        async estimateManual(gb, type) {
            const parsed = await this._getTiers();
            if (!parsed) return { success: false, reason: '无法读取站点兑换档位' };
            const plan = type === 'download'
                ? { uploadGB: 0, downloadGB: gb }
                : { uploadGB: gb, downloadGB: 0 };
            return { ...this._estimatePlanCost(parsed, plan), pageBonus: parsed.pageBonus || 0, parsed };
        },

        /**
         * 晋级计划兑换：按 evaluate() 算出的缺口，先兑上传量、再兑下载量
         * 不再被"无需兑换"拦截——只要存在流量缺口就会执行
         */
        async executeExchange(opts = {}) {
            Log.info('开始执行兑换（晋级计划驱动）...');

            const stats = await UserStats.collect();   // 先刷新流量与魔力值，避免按旧状态生成计划
            const evaluation = RuleEngine.evaluate();
            if (!evaluation.needsExchange) {
                const why = evaluation.promotionStatus === 'met'
                    ? '已满足下一等级晋级条件，等待系统自动晋级'
                    : (evaluation.messages[0] || '当前无流量缺口，无需兑换');
                Log.info(why);
                return { success: false, reason: why };
            }

            const parsed = await this._getTiers();
            if (!parsed) return { success: false, reason: '未找到兑换档位（无法解析 mybonus 页面）' };

            const GB = 1024 * 1024 * 1024;
            const plan = evaluation.exchangePlan
                || { downloadGB: 0, uploadGB: Math.ceil((evaluation.exchangeAmount || 0) / GB) };
            const estimate = this._estimatePlanCost(parsed, plan);
            if (!estimate.success) return estimate;

            if (plan.requiresTimeConfirmation) {
                const confirmationContext = {
                    evaluation,
                    plan,
                    estimate,
                    currentBonus: parsed.pageBonus || stats.bonus,
                };
                if (typeof opts.confirmTimeUnmet !== 'function') {
                    return {
                        success: false,
                        confirmationRequired: true,
                        reason: '注册时间尚未达标，需要用户确认后才能提前兑换',
                        ...confirmationContext,
                    };
                }
                const confirmed = await opts.confirmTimeUnmet(confirmationContext);
                if (!confirmed) {
                    return {
                        success: false,
                        cancelled: true,
                        reason: '用户取消了注册时间未达标时的提前兑换',
                        estimate,
                    };
                }
            }

            const done = [];
            let confirmedBonus = parsed.pageBonus || stats.bonus;
            // 必须先补上传量，再补下载量；否则下载会先拉低分享率。
            if (plan.uploadGB > 0) {
                const r = await this._exchangeRepeated(parsed, 'upload', plan.uploadGB, confirmedBonus, opts);
                if (!r.success) return r;
                confirmedBonus = r.afterBonus;
                done.push(`上传量 ${r.gb} GB(-${r.cost} 魔力值)`);
            }
            // 上传成功并经过站点冷却后，才兑换下载量。
            if (plan.downloadGB > 0) {
                const r = await this._exchangeRepeated(parsed, 'download', plan.downloadGB, confirmedBonus, opts);
                if (!r.success) {
                    return done.length
                        ? { success: true, partial: true, message: done.join(' + ') + `；下载量兑换失败: ${r.reason}` }
                        : r;
                }
                confirmedBonus = r.afterBonus;
                done.push(`下载量 ${r.gb} GB(-${r.cost} 魔力值)`);
            }

            Storage.setUserStats({ ...stats, bonus: confirmedBonus });
            return { success: true, message: done.join(' + '), plan, estimatedCost: estimate.totalCost };
        },

        /**
         * 固定使用 100 GB 档位循环到目标量。目标不是 100 的整数倍时向上取整。
         * 每轮成功后等待站点冷却；冷却拒绝最多自动重试两次。
         */
        async _exchangeRepeated(parsed, type, targetGB, beforeBonus, opts = {}) {
            const typeName = type === 'download' ? '下载量' : '上传量';
            const tier = parsed.tiers.find(t => t.type === type && Math.abs(t.gb - 100) < 0.001);
            if (!tier) return { success: false, reason: `站点没有 100 GB ${typeName}兑换档位` };

            const totalRuns = Math.ceil(Math.max(0, Number(targetGB) || 0) / 100);
            if (!totalRuns) return { success: false, reason: '无效的目标兑换量' };
            let currentBonus = beforeBonus;
            let totalCost = 0;
            let completedRuns = 0;

            for (let i = 0; i < totalRuns; i++) {
                let retries = 0;
                while (true) {
                    const waitMs = this.getCooldownRemaining();
                    if (waitMs > 0) {
                        opts.onProgress?.({ phase: 'cooldown', completedRuns, totalRuns, waitMs, type });
                        await sleep(waitMs + 250);
                    }

                    // 估算页与当前页面都可能是旧 DOM；每批提交前以服务器余额作唯一基准。
                    const freshBonus = await this._fetchCurrentBonus('np_before', `${Date.now()}-${i}-${retries}`);
                    if (freshBonus === null) {
                        return {
                            success: false,
                            partial: completedRuns > 0,
                            gb: completedRuns * 100,
                            cost: totalCost,
                            afterBonus: currentBonus,
                            reason: '无法读取提交前的服务器魔力值，已停止以避免误兑换',
                        };
                    }
                    currentBonus = freshBonus;

                    const minBonusKeep = Math.max(0, Number(opts.minBonusKeep) || 0);
                    if (tier.cost > currentBonus - minBonusKeep) {
                        return {
                            success: false,
                            partial: completedRuns > 0,
                            gb: completedRuns * 100,
                            cost: totalCost,
                            afterBonus: currentBonus,
                            reason: `魔力值不足（下一次需 ${tier.cost}，当前 ${currentBonus.toFixed(1)}，保留 ${minBonusKeep}）`,
                        };
                    }

                    const result = await this._verifyBonusDeduction(
                        currentBonus,
                        await AutoExchange._submitTier(parsed, tier),
                        tier.cost
                    );
                    if (result.success) {
                        currentBonus = result.afterBonus;
                        totalCost += Number.isFinite(result.deducted) ? result.deducted : tier.cost;
                        completedRuns++;
                        Storage.setLastExchange(Date.now());

                        const stored = Storage.getUserStats() || {};
                        const GB = 1024 * 1024 * 1024;
                        const updated = { ...stored, bonus: currentBonus };
                        if (type === 'upload') updated.uploaded = (stored.uploaded || 0) + 100 * GB;
                        else updated.downloaded = (stored.downloaded || 0) + 100 * GB;
                        if (updated.downloaded > 0) updated.ratio = updated.uploaded / updated.downloaded;
                        Storage.setUserStats(updated);

                        opts.onProgress?.({
                            phase: 'success', completedRuns, totalRuns, gb: completedRuns * 100, type,
                            accountingWarning: result.accountingWarning,
                        });
                        Log.info(`循环兑换进度: ${typeName} ${completedRuns}/${totalRuns}（${completedRuns * 100} GB）`);
                        break;
                    }

                    if (result.cooldown && retries < 2) {
                        retries++;
                        Storage.setLastExchange(Date.now());
                        Log.warn(`站点冷却拒绝，等待后重试（${retries}/2）`);
                        continue;
                    }
                    return {
                        ...result,
                        partial: completedRuns > 0,
                        gb: completedRuns * 100,
                        cost: totalCost,
                    };
                }
            }

            return {
                success: true,
                gb: completedRuns * 100,
                cost: totalCost,
                type,
                runs: completedRuns,
                afterBonus: currentBonus,
            };
        },

        /**
         * 手动兑换：指定 GB 数和类型。使用后台请求并核验余额，避免 DOM 点击后虚报成功。
         */
        async executeManual(gb, type = 'upload', opts = {}) {
            gb = parseFloat(gb);
            if (!gb || gb <= 0) return { success: false, reason: '无效的兑换量' };

            const stats = await UserStats.collect();   // 刷新魔力值
            const parsed = opts.parsed || await this._getTiers();
            if (!parsed) return { success: false, reason: '未找到兑换档位（无法解析 mybonus 页面）' };

            return await this._exchangeRepeated(parsed, type, gb, parsed.pageBonus || stats.bonus, opts);
        },

        /** 获取兑换档位与当前余额：优先禁缓存 GET，失败时才回退到当前 mybonus 页面。 */
        async _getTiers() {
            try {
                const url = new URL('mybonus.php', window.location.href);
                url.searchParams.set('np_tiers', String(Date.now()));
                const resp = await fetch(url.href, { credentials: 'same-origin', cache: 'no-store' });
                if (!resp.ok) return null;
                const doc = new DOMParser().parseFromString(await resp.text(), 'text/html');
                const parsed = AutoExchange._parseExchangeTiers(doc);
                if (parsed) parsed.pageBonus = AutoExchange._extractPageBonus(doc);
                return parsed;
            } catch (e) {
                Log.warn('fetch mybonus.php 失败:', e);
                if (/mybonus\.php|bonus\.php/.test(getPath())) {
                    const parsed = AutoExchange._parseExchangeTiers(document);
                    if (parsed && parsed.tiers.length) {
                        parsed.pageBonus = AutoExchange._extractPageBonus(document);
                        return parsed;
                    }
                }
                return null;
            }
        },

        /**
         * 按类型兑换一个档位
         * 选档策略: 预算内 ≥targetGB 的最小档；都不够大则用能负担的最大档
         */
        async _exchangeOneTier(parsed, type, targetGB, opts = {}) {
            const stats = Storage.getUserStats();
            const budget = Math.max(0, (stats?.bonus || 0) - (opts.keepBonus || 0));
            const typeName = type === 'download' ? '下载量' : '上传量';

            const pool = parsed.tiers.filter(t => t.type === type);
            if (!pool.length) {
                return { success: false, reason: `站点没有${typeName}兑换档位` };
            }
            const affordable = pool.filter(t => t.cost <= budget);
            if (!affordable.length) {
                const minCost = Math.min(...pool.map(t => t.cost));
                return { success: false, reason: `魔力值不足（${typeName}最低档需 ${minCost}，当前 ${budget.toFixed(0)}）` };
            }
            let tier = affordable.filter(t => t.gb >= targetGB).sort((a, b) => a.gb - b.gb)[0];
            if (!tier) tier = affordable.slice().sort((a, b) => b.gb - a.gb)[0];

            Log.info(`将兑换 ${tier.gb} GB ${typeName}，消耗 ${tier.cost} 魔力值（目标 ${targetGB} GB）`);

            // 后台 POST（不跳转页面）；调用者必须再核验返回页余额后才能提示成功。
            const r = await AutoExchange._submitTier(parsed, tier);
            if (r.success) {
                return { success: true, gb: tier.gb, cost: tier.cost, type, method: 'xhr', responseText: r.responseText };
            }
            return { success: false, reason: r.reason };
        },
    };

    // ============================================================
    // 12.5 AUTO EXCHANGE — 自动兑换调度器（后台执行，不依赖当前页面）
    // ============================================================

    const AutoExchange = {
        _timer: null,
        _running: false,

        /** 启动调度：首次 10 秒后检查；后续按任务需要重新安排下一次检查。 */
        start() {
            if (this._timer) return;
            this._schedule(10000);
            Log.info('自动兑换调度器已启动');
        },

        _schedule(delayMs) {
            if (this._timer) clearTimeout(this._timer);
            this._timer = setTimeout(async () => {
                this._timer = null;
                let nextDelay = 60000;
                try {
                    nextDelay = await this.checkAndRun();
                } catch (e) {
                    Log.error('自动兑换调度器异常:', e);
                }
                this._schedule(Math.max(1000, Number(nextDelay) || 60000));
            }, Math.max(1000, delayMs));
        },

        scheduleSoon() {
            if (!this._running) this._schedule(1000);
        },

        /** 检查条件并视情况执行自动兑换 */
        async checkAndRun() {
            if (this._running) return 1000;
            const settings = Storage.getSettings();
            if (!settings.autoExchange) return 60000;           // 总开关（默认关）

            // 按量完成模式使用站点冷却，不能被旧版的一小时全局冷却拦住。
            if (settings.autoExchangeMode !== 'amount' && BonusExchange.isOnCooldown()) {
                return Math.min(60000, Math.max(1000, BonusExchange.getCooldownRemaining()));
            }

            if (settings.autoExchangeMode !== 'amount') {
                const intervalMin = settings.autoExchangeIntervalMin || 60;
                const last = Storage.getLastExchange();
                if (last && Date.now() - last < intervalMin * 60000) {
                    return Math.min(60000, Math.max(1000, intervalMin * 60000 - (Date.now() - last)));
                }
            }

            this._running = true;
            try {
                const stats = await UserStats.collect();
                if (!stats.bonus || stats.bonus <= 0) {
                    Log.warn('自动兑换: 魔力值未知或为 0，跳过本次');
                    return 60000;
                }

                if (settings.autoExchangeMode === 'amount') {
                    return await this._runAmountExchange(settings, stats);
                }

                // 计算兑换目标：promotion 用晋级计划（下载+上传两轮），fixed 用定额
                /** @type {Array<{type:string, gb:number}>} */
                const jobs = [];
                if (settings.autoExchangeMode === 'fixed') {
                    const gb = Math.max(0, settings.autoExchangeFixedGB || 0);
                    if (gb >= 1) jobs.push({ type: settings.autoExchangeFixedType === 'download' ? 'download' : 'upload', gb });
                } else {
                    const evaluation = RuleEngine.evaluate();
                    if (!evaluation.needsExchange) return;
                    const plan = evaluation.exchangePlan
                        || { downloadGB: 0, uploadGB: Math.ceil((evaluation.exchangeAmount || 0) / (1024 * 1024 * 1024)) };
                    if (plan.requiresTimeConfirmation) {
                        Log.warn('自动兑换: 注册时间尚未达标，必须由用户在面板中确认，跳过本次');
                        return 60000;
                    }
                    if (plan.uploadGB > 0) jobs.push({ type: 'upload', gb: plan.uploadGB });
                    if (plan.downloadGB > 0) jobs.push({ type: 'download', gb: plan.downloadGB });
                }
                if (!jobs.length) return 60000;

                const maxGB = settings.autoExchangeMaxGBPerRun || 100;
                let remainingRunLimit = maxGB;
                const done = [];
                for (let i = 0; i < jobs.length && remainingRunLimit > 0; i++) {
                    const job = jobs[i];
                    const jobGB = Math.min(job.gb, remainingRunLimit);
                    Log.info(`自动兑换触发: ${job.type} ${jobGB} GB（模式: ${settings.autoExchangeMode || 'promotion'}）`);
                    const result = await this._backgroundExchange(job.type, jobGB, stats, settings);
                    if (result.success) {
                        done.push(`${job.type === 'download' ? '下载量' : '上传量'} ${result.gb} GB(-${result.cost})`);
                        remainingRunLimit -= result.gb;
                        stats.bonus = result.afterBonus;
                        Storage.setUserStats({ ...Storage.getUserStats(), bonus: result.afterBonus });
                    } else {
                        Log.warn('自动兑换失败:', result.reason);
                        showNotification(`⚠️ 自动兑换失败: ${result.reason}`, 'warning', 5000);
                        break;
                    }
                    // 站点限制 10 秒一次，两轮之间等待一个冷却周期加缓冲。
                    if (i < jobs.length - 1 && remainingRunLimit > 0) {
                        await sleep(CONFIG.EXCHANGE_COOLDOWN + 1000);
                    }
                }
                if (done.length) {
                    showNotification(`✅ 自动兑换成功: ${done.join(' + ')}`, 'success', 6000);
                    Panel.update();
                }
                return 60000;
            } catch (e) {
                Log.error('自动兑换异常:', e);
                return 60000;
            } finally {
                this._running = false;
            }
        },

        _tierKey(tier) {
            return `${tier.type}:${tier.value}`;
        },

        _detectCooldownSeconds(doc) {
            const text = (doc.body?.innerText || doc.body?.textContent || '').replace(/\s+/g, ' ');
            const patterns = [
                /(?:系统|站点)?\s*(?:限制|冷却|间隔)[^\d]{0,24}(\d+(?:\.\d+)?)\s*(秒|分钟|分|min(?:ute)?s?|seconds?|secs?)/i,
                /(\d+(?:\.\d+)?)\s*(秒|分钟|分|min(?:ute)?s?|seconds?|secs?)[^。！？]{0,40}(?:点击|交换|兑换|exchange)/i,
            ];
            for (const pattern of patterns) {
                const match = text.match(pattern);
                if (!match) continue;
                const multiplier = /^(?:分钟|分|min)/i.test(match[2]) ? 60 : 1;
                const seconds = parseFloat(match[1]) * multiplier;
                if (Number.isFinite(seconds) && seconds > 0) return Math.ceil(seconds);
            }
            return 0;
        },

        _configuredCooldownSeconds(settings, doc) {
            if (settings.autoExchangeCooldownMode === 'manual') {
                return Math.max(1, Math.ceil(Number(settings.autoExchangeCooldownSeconds) || 0));
            }
            return this._detectCooldownSeconds(doc);
        },

        _extractPageBonus(doc) {
            const pageStats = { bonus: 0 };
            UserStats._extractBonus(pageStats, doc);
            return Number.isFinite(pageStats.bonus) && pageStats.bonus > 0 ? pageStats.bonus : null;
        },

        _pauseAmountExchange(settings, reason) {
            Storage.setSettings({ ...settings, autoExchange: false });
            Log.warn(`自动按量兑换已暂停: ${reason}`);
            showNotification(`⚠️ 自动按量兑换已暂停：${reason}`, 'warning', 7000);
            return 60000;
        },

        /**
         * 按量完成：每次只提交用户指定的一档；成功后保存实际完成量与剩余目标，
         * 再由调度器在站点冷却结束后执行下一次，避免单页长循环与重复提交。
         */
        async _runAmountExchange(settings, stats) {
            const targetGB = Math.max(0, Number(settings.autoExchangeAmountGB) || 0);
            const storedRemainingGB = Number(settings.autoExchangeAmountRemainingGB);
            const remainingGB = Number.isFinite(storedRemainingGB)
                ? Math.max(0, storedRemainingGB)
                : targetGB;
            if (!targetGB || !remainingGB) {
                return this._pauseAmountExchange(settings, '没有可执行的剩余兑换量');
            }
            if (!settings.autoExchangeAmountTierKey) {
                return this._pauseAmountExchange(settings, '请选择本站兑换档位');
            }

            const resp = await fetch('mybonus.php', { credentials: 'same-origin' });
            if (!resp.ok) return this._pauseAmountExchange(settings, `读取 mybonus.php 失败（HTTP ${resp.status}）`);
            const doc = new DOMParser().parseFromString(await resp.text(), 'text/html');
            const parsed = this._parseExchangeTiers(doc);
            if (!parsed?.tiers?.length) {
                return this._pauseAmountExchange(settings, '未在 mybonus 页面找到兑换档位');
            }
            const beforeBonus = this._extractPageBonus(doc);

            const cooldownSeconds = this._configuredCooldownSeconds(settings, doc);
            if (!cooldownSeconds) {
                return this._pauseAmountExchange(settings, '无法自动识别站点兑换冷却，请改为手动填写秒数');
            }
            const last = Storage.getLastExchange();
            const waitMs = last ? cooldownSeconds * 1000 - (Date.now() - last) : 0;
            if (waitMs > 0) return waitMs + 250;

            const tier = parsed.tiers.find(t =>
                this._tierKey(t) === settings.autoExchangeAmountTierKey
                && (t.type === 'upload' || t.type === 'download')
                && Math.abs(t.gb - 100) < 0.001
            );
            if (!tier) {
                return this._pauseAmountExchange(settings, '所选 100 GB 档位已不在本站兑换页面中');
            }
            const keepBonus = Math.max(0, Number(settings.autoExchangeMinBonusKeep) || 0);
            const budget = Math.max(0, (stats.bonus || 0) - keepBonus);
            if (tier.cost > budget) {
                return this._pauseAmountExchange(settings, `魔力值不足以兑换所选档位（需 ${tier.cost}，可用 ${budget.toFixed(1)}）`);
            }

            Log.info(`自动按量兑换: ${tier.type} ${tier.gb} GB，剩余目标 ${remainingGB} GB`);
            const result = await BonusExchange._verifyBonusDeduction(
                beforeBonus,
                await this._submitTier(parsed, tier),
                tier.cost
            );
            if (!result.success) {
                if (result.cooldown) {
                    Log.warn('站点仍处于兑换冷却，等待下一轮调度');
                    return cooldownSeconds * 1000 + 250;
                }
                return this._pauseAmountExchange(settings, result.reason || '站点拒绝了兑换请求');
            }

            Storage.setLastExchange(Date.now());
            const nextRemainingGB = Math.max(0, remainingGB - tier.gb);
            const completedGB = Math.max(0, Number(settings.autoExchangeAmountCompletedGB) || 0) + tier.gb;
            const nextSettings = {
                ...settings,
                autoExchange: nextRemainingGB > 0,
                autoExchangeAmountRemainingGB: nextRemainingGB,
                autoExchangeAmountCompletedGB: completedGB,
            };
            Storage.setSettings(nextSettings);
            Storage.setUserStats({ ...stats, bonus: result.afterBonus });

            if (nextRemainingGB > 0) {
                showNotification(`✅ 自动按量兑换：已兑换 ${tier.gb} GB，剩余目标 ${nextRemainingGB} GB`, 'success', 5000);
            } else {
                showNotification(`✅ 自动按量兑换完成：实际兑换 ${completedGB} GB`, 'success', 7000);
            }
            Panel.update();
            return cooldownSeconds * 1000 + 250;
        },

        /**
         * 后台兑换：fetch mybonus.php 解析兑换表单与档位，再提交
         * 不依赖当前停留在 mybonus 页面
         * @param {'upload'|'download'} type 兑换类型
         * @param {number} targetGB 目标 GB 数
         */
        async _backgroundExchange(type, targetGB, stats, settings) {
            const resp = await fetch('mybonus.php', { credentials: 'same-origin' });
            if (!resp.ok) return { success: false, reason: `mybonus.php HTTP ${resp.status}` };
            const html = await resp.text();
            const doc = new DOMParser().parseFromString(html, 'text/html');

            const parsed = this._parseExchangeTiers(doc);
            if (!parsed || !parsed.tiers.length) {
                return { success: false, reason: '未在 mybonus 页面找到兑换档位' };
            }

            // 所有自动路径固定使用 100 GB 档，避免误选更差汇率的小档。
            const keepBonus = settings.autoExchangeMinBonusKeep || 0;
            const budget = Math.max(0, (stats.bonus || 0) - keepBonus);
            const pool = parsed.tiers.filter(t => t.type === type && Math.abs(t.gb - 100) < 0.001);
            if (!pool.length) {
                return { success: false, reason: `站点没有 100 GB ${type === 'download' ? '下载量' : '上传量'}兑换档位` };
            }
            const affordable = pool.filter(t => t.cost <= budget);
            if (!affordable.length) {
                return { success: false, reason: `魔力值预算不足（当前 ${stats.bonus.toFixed(1)}，保留 ${keepBonus}）` };
            }
            const tier = affordable[0];

            const result = await BonusExchange._verifyBonusDeduction(
                stats.bonus,
                await this._submitTier(parsed, tier),
                tier.cost
            );
            if (result.success) {
                Storage.setLastExchange(Date.now());
                return { success: true, gb: tier.gb, cost: tier.cost, afterBonus: result.afterBonus };
            }
            return { success: false, reason: result.reason, cooldown: result.cooldown };
        },

        /**
         * 从 mybonus 页面文档解析"上传量"兑换档位
         * 支持两种结构:
         *   A) 标准 NexusPHP: 单个 form + <select name="option"> 下拉档位
         *   B) GGPT 风格: 每档一个独立 form + <input type="hidden" name="option" value="N">
         *      + 标题 <h1>1.0 GB上传量</h1> + 纯数字价格列
         * 返回 { tiers, tierFieldName, action, method, submitName, submitValue, extraFields, selectEl? }
         */
        _parseExchangeTiers(doc) {
            // ---- 结构 A: select 下拉档位 ----
            for (const form of doc.querySelectorAll('form')) {
                const select = form.querySelector('select');
                if (!select) continue;

                const tiers = [];
                for (const opt of select.querySelectorAll('option')) {
                    const tier = this._parseTierText(opt.textContent || '', opt.value);
                    if (tier) tiers.push(tier);
                }

                if (tiers.length) {
                    const submitBtn = form.querySelector('input[type="submit"], button[type="submit"]');
                    return {
                        tiers,
                        tierFieldName: select.name || 'option',
                        action: form.getAttribute('action') || 'mybonus.php',
                        method: (form.getAttribute('method') || 'post').toLowerCase(),
                        submitName: submitBtn ? (submitBtn.name || '') : 'submit',
                        submitValue: submitBtn ? (submitBtn.value || '') : '',
                        extraFields: Array.from(form.querySelectorAll('input[type="hidden"]'))
                            .filter(i => i.name && i.name !== (select.name || 'option'))
                            .map(i => ({ name: i.name, value: i.value })),
                        selectEl: doc === document ? select : null,
                        formEl: doc === document ? form : null,
                    };
                }
            }

            // ---- 结构 B: 每档独立 form（GGPT）----
            const tiers = [];
            let formInfo = null;
            for (const form of doc.querySelectorAll('form')) {
                const hidden = form.querySelector('input[type="hidden"][name="option"]');
                if (!hidden || hidden.value === '') continue;

                const tier = this._parseTierText(form.textContent || '', hidden.value);
                if (!tier) continue;

                // 价格: form 内 td.rowfollow 中的纯数字列（GGPT 价格独立成列，如 "300"、"10,000"）
                for (const td of form.querySelectorAll('td.rowfollow')) {
                    const t = (td.textContent || '').trim().replace(/,/g, '');
                    if (/^\d+(?:\.\d+)?$/.test(t)) {
                        tier.cost = parseFloat(t);
                        break;
                    }
                }
                if (doc === document) tier.formEl = form;
                tiers.push(tier);

                if (!formInfo) {
                    const submitBtn = form.querySelector('input[type="submit"], button[type="submit"]');
                    formInfo = {
                        action: form.getAttribute('action') || 'mybonus.php',
                        method: (form.getAttribute('method') || 'post').toLowerCase(),
                        submitName: submitBtn ? (submitBtn.name || '') : 'submit',
                        submitValue: submitBtn ? (submitBtn.value || '') : '',
                    };
                }
            }
            if (tiers.length) {
                return {
                    tiers,
                    tierFieldName: 'option',
                    ...formInfo,
                    extraFields: [],
                };
            }

            // GGPT 的原始 HTML 把 form 直接放在 tr 内，属于无效表格结构。
            // 浏览器会自动关闭 form，导致 hidden option 和 submit 按钮成为 tr 的子元素。
            // 因此不能只从 form 内找 option，需按包含 option 的表格行恢复档位。
            const rowTiers = [];
            let rowFormInfo = null;
            const exchangeForms = Array.from(doc.querySelectorAll('form[action*="action=exchange"]'));
            for (const hidden of doc.querySelectorAll('input[type="hidden"][name="option"]')) {
                if (hidden.value === '') continue;
                const row = hidden.closest('tr');
                if (!row) continue;

                // 不使用整行文本：左侧项目编号会与 "1.0 GB" 连在一起，
                // 使 1.0 GB 被误读为 11.0 GB。优先读取容量标题或简介单元格。
                const tierSource = row.querySelector('h1')
                    || Array.from(row.querySelectorAll('td')).find(td =>
                        /(\d+(?:\.\d+)?)\s*(?:GB|GiB|TB|TiB)\s*(?:上传|下载|upload|download)/i.test(td.textContent || '')
                    );
                const tier = this._parseTierText(tierSource ? tierSource.textContent : '', hidden.value);
                if (!tier) continue;

                const priceCell = Array.from(row.querySelectorAll('td.rowfollow'))
                    .find(td => /^\d+(?:\.\d+)?$/.test((td.textContent || '').trim().replace(/,/g, '')));
                if (priceCell) tier.cost = parseFloat((priceCell.textContent || '').trim().replace(/,/g, ''));
                rowTiers.push(tier);

                if (!rowFormInfo) {
                    const rowForm = row.querySelector('form[action*="action=exchange"]') || exchangeForms[0];
                    const submitBtn = row.querySelector('input[type="submit"], button[type="submit"]');
                    rowFormInfo = {
                        action: rowForm ? (rowForm.getAttribute('action') || 'mybonus.php') : 'mybonus.php',
                        method: rowForm ? (rowForm.getAttribute('method') || 'post').toLowerCase() : 'post',
                        submitName: submitBtn ? (submitBtn.name || '') : 'submit',
                        submitValue: submitBtn ? (submitBtn.value || '') : '',
                    };
                }
            }
            if (rowTiers.length) {
                return {
                    tiers: rowTiers,
                    tierFieldName: 'option',
                    ...rowFormInfo,
                    extraFields: [],
                };
            }
            return null;
        },

        /**
         * 从文本解析单个兑换档位（GB 数 + 价格 + 类型）
         * 容量后紧邻"上传"→ upload，紧邻"下载"→ download；其余（邀请/头衔/H&R）返回 null
         * 文本例: "1 GB 上传量 - 100 魔力值"、"1.0 GB上传量 ..."、"10.0 GB 下载量 ..."
         */
        _parseTierText(rawText, value) {
            const text = String(rawText).replace(/\s+/g, ' ').trim();

            // 容量 + 类型（紧邻判断，排除"GB 下载量"混入上传档等）
            const m = text.match(/(\d+(?:\.\d+)?)\s*(GB|GiB|TB|TiB)\s*(上传|上[传傳]|download|下载|下[载載]|upload)/i);
            if (!m) return null;
            const type = /download|下载|下[载載]/i.test(m[3]) ? 'download' : 'upload';
            let gb = parseFloat(m[1]);
            if (/^T/i.test(m[2])) gb *= 1024;

            // 文本内显式价格（"100 魔力值"）；没有则按 500/GB 估算（结构 B 会从价格列覆盖）
            const costM = text.match(/(\d+(?:\.\d+)?)\s*(?:魔力值|魔力|积分|points?|Karma)/i);
            const cost = costM ? parseFloat(costM[1]) : gb * 500;

            return { value, gb, cost, type, text };
        },

        /**
         * 提交指定兑换档位（POST/GET 均可）
         * action 可能是 "?action=exchange"（GGPT）——基址必须取 mybonus.php 而非当前页
         */
        async _submitTier(parsed, tier) {
            const postData = new URLSearchParams();
            postData.set(parsed.tierFieldName, tier.value);
            for (const f of parsed.extraFields) postData.set(f.name, f.value);
            if (parsed.submitName) postData.set(parsed.submitName, parsed.submitValue);

            const baseUrl = new URL('mybonus.php', window.location.href).href;
            const submitUrl = new URL(parsed.action, baseUrl).href;
            const method = parsed.method || 'post';
            const requestUrl = method === 'get'
                ? `${submitUrl}${submitUrl.includes('?') ? '&' : '?'}${postData.toString()}`
                : submitUrl;

            Log.info(`兑换提交: ${method.toUpperCase()} ${requestUrl} 数据: ${postData.toString()}`);

            return await new Promise((resolve) => {
                GM_xmlhttpRequest({
                    method: method.toUpperCase(),
                    url: requestUrl,
                    data: method === 'get' ? undefined : postData.toString(),
                    headers: method === 'get' ? undefined : { 'Content-Type': 'application/x-www-form-urlencoded' },
                    onload: (r) => {
                        const responseText = r.responseText || '';
                        const text = responseText.substring(0, 1500);
                        // 说明文字也可能写着“限制 10 秒”或“魔力值不足”，不能据此判失败。
                        // 这里只识别明确的服务器拒绝；按量模式还会核对返回页的余额是否实际扣减。
                        const cooldown = /(?:冷却(?:中|尚未结束)|操作过于频繁|请.{0,16}(?:等待|稍后)|too\s*(?:soon|fast)|cooldown|wait\s+\d+)/i.test(text);
                        const explicitFailure = /(?:兑换|交换).{0,16}(?:失败|错误)|(?:失败|错误).{0,16}(?:兑换|交换)|exchange.{0,16}(?:failed|error)|(?:failed|error).{0,16}exchange|not\s+enough/i.test(text);
                        const failed = cooldown || explicitFailure;
                        resolve(r.status === 200 && !failed
                            ? { success: true, responseText }
                            : {
                                success: false,
                                cooldown,
                                reason: cooldown
                                    ? '站点提示兑换冷却尚未结束'
                                    : '站点拒绝了兑换请求（参数不匹配或魔力值不足）',
                            });
                    },
                    onerror: () => resolve({ success: false, reason: '网络请求失败' }),
                    ontimeout: () => resolve({ success: false, reason: '请求超时' }),
                });
            });
        },
    };

    // ============================================================
    // 13.  UI — 浮动面板
    // ============================================================

    const Panel = {
        panel: null,
        isMinimized: false,

        /** 初始化面板 */
        init() {
            if (document.getElementById('np-panel')) return;

            GM_addStyle(STYLES);

            const panel = document.createElement('div');
            panel.id = 'np-panel';
            panel.className = 'np-top-right';

            panel.innerHTML = `
                <div id="np-panel-header">
                    <span id="np-panel-title">⚡ NP 晋级助手</span>
                    <button id="np-panel-toggle">−</button>
                </div>
                <div id="np-panel-body">
                    <div class="np-section" id="np-section-status">
                        <div class="np-section-title">📊 状态概览</div>
                        <div id="np-status-content">加载中...</div>
                    </div>
                    <div class="np-section" id="np-section-rules">
                        <div class="np-section-title">📋 晋级信息</div>
                        <div id="np-rules-content">加载中...</div>
                    </div>
                    <div class="np-section" id="np-section-actions">
                        <div style="display:flex;gap:4px;flex-wrap:wrap;">
                            <button class="np-btn primary" id="np-btn-refresh">🔄 刷新</button>
                            <button class="np-btn success" id="np-btn-exchange">🎯 晋级兑换</button>
                            <button class="np-btn" id="np-btn-faq">📖 FAQ</button>
                            <button class="np-btn" id="np-btn-settings">⚙️ 设置</button>
                        </div>
                        <div id="np-promotion-estimate" style="display:none;margin-top:6px;padding:5px 6px;border:1px solid #3a3a4e;border-radius:4px;color:#b8c7e8;font-size:11px;line-height:1.5;"></div>
                        <div style="margin-top:8px;padding-top:7px;border-top:1px solid #3a3a4e;">
                            <div style="margin-bottom:4px;color:#b8c7e8;font-size:12px;">手动兑换</div>
                            <div style="display:grid;grid-template-columns:76px minmax(0,1fr) 100px;gap:4px;align-items:end;">
                                <label style="display:block;font-size:11px;color:#a9a9b5;">总量（GB）
                                    <input id="np-manual-gb" type="number" min="100" step="100" placeholder="100" title="任务总量；固定按 100 GB 档循环，非整百向上取整" style="width:100%;margin-top:2px;padding:4px;box-sizing:border-box;background:#222;border:1px solid #444;color:#e0e0e0;border-radius:4px;font-size:12px;">
                                </label>
                                <label style="display:block;font-size:11px;color:#a9a9b5;">兑换类型
                                    <select id="np-manual-type" style="width:100%;margin-top:2px;padding:4px;background:#222;border:1px solid #444;color:#e0e0e0;border-radius:4px;font-size:12px;">
                                        <option value="upload">上传量</option>
                                        <option value="download">下载量</option>
                                    </select>
                                </label>
                                <button class="np-btn" id="np-btn-manual-exchange" title="按输入数量立即兑换" style="height:28px;white-space:nowrap;">⚡ 立即兑换</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(panel);
            this.panel = panel;

            // 绑定事件
            this._bindEvents();

            // 使面板可拖动
            this._makeDraggable();

            // 加载设置
            const settings = Storage.getSettings();
            if (settings.panelPosition) {
                this.setPosition(settings.panelPosition);
            }

            // 初始更新
            this.update();
        },

        /** 绑定事件 */
        _bindEvents() {
            // 最小化/展开
            const toggle = document.getElementById('np-panel-toggle');
            if (toggle) {
                toggle.addEventListener('click', () => {
                    this.isMinimized = !this.isMinimized;
                    const body = document.getElementById('np-panel-body');
                    if (body) {
                        body.style.display = this.isMinimized ? 'none' : 'block';
                    }
                    toggle.textContent = this.isMinimized ? '+' : '−';
                });
            }

            // 刷新按钮
            const refreshBtn = document.getElementById('np-btn-refresh');
            if (refreshBtn) {
                refreshBtn.addEventListener('click', async () => {
                    refreshBtn.disabled = true;
                    try {
                        await UserStats.collect({ forceDetailsRefresh: true });
                        this.update();
                        showNotification('状态已刷新', 'info', 2000);
                    } finally {
                        refreshBtn.disabled = false;
                    }
                });
            }

            // 晋级兑换按钮（按 evaluate 算出的缺口计划执行，任意页面可用）
            const exchangeBtn = document.getElementById('np-btn-exchange');
            if (exchangeBtn) {
                exchangeBtn.addEventListener('click', async () => {
                    exchangeBtn.disabled = true;
                    try {
                        const result = await BonusExchange.executeExchange({
                            confirmTimeUnmet: confirmTimeUnmetExchange,
                            onProgress: ({ phase, completedRuns, totalRuns, type }) => {
                                const typeName = type === 'download' ? '下载' : '上传';
                                exchangeBtn.textContent = phase === 'cooldown'
                                    ? `⏳ ${typeName}等待 ${completedRuns}/${totalRuns}`
                                    : `⏳ ${typeName} ${completedRuns}/${totalRuns}`;
                            },
                        });
                        if (result.success) {
                            showNotification(`✅ 兑换完成: ${result.message || '成功'}`, 'success', 6000);
                        } else if (result.cancelled) {
                            showNotification('已取消提前兑换', 'info', 3000);
                        } else {
                            showNotification(`兑换未完成: ${result.reason || '未知错误'}`, 'warning', 6000);
                        }
                    } catch (e) {
                        Log.error('晋级兑换异常:', e);
                        showNotification(`兑换异常: ${e.message || e}`, 'error', 6000);
                    } finally {
                        exchangeBtn.disabled = false;
                        exchangeBtn.textContent = '🎯 晋级兑换';
                        this.update();
                    }
                });
            }

            // 手动兑换按钮（指定 GB + 类型，立即执行，不被评估拦截）
            const manualBtn = document.getElementById('np-btn-manual-exchange');
            if (manualBtn) {
                manualBtn.addEventListener('click', async () => {
                    const gb = parseFloat(document.getElementById('np-manual-gb')?.value);
                    const type = document.getElementById('np-manual-type')?.value || 'upload';
                    const typeName = type === 'download' ? '下载量' : '上传量';
                    if (!gb || gb <= 0) {
                        showNotification('请输入有效的 GB 数', 'warning', 3000);
                        return;
                    }
                    manualBtn.disabled = true;
                    try {
                        manualBtn.textContent = '⏳ 计算费用';
                        const estimate = await BonusExchange.estimateManual(gb, type);
                        if (!estimate.success) {
                            showNotification(`无法估算费用: ${estimate.reason}`, 'error', 5000);
                            return;
                        }
                        const detail = type === 'download' ? estimate.download : estimate.upload;
                        const shortage = estimate.pageBonus > 0
                            ? Math.max(0, detail.cost - estimate.pageBonus)
                            : 0;
                        if (!confirm([
                            `确认执行 ${detail.runs} 次 100 GB ${typeName}兑换？`,
                            `后台将连续执行 ${detail.runs} 批，每批固定 100 GB，无需逐批点击。`,
                            `目标总量：${gb} GB`,
                            `实际兑换：${detail.actualGB} GB`,
                            `预计消耗：${formatInteger(detail.cost)} G`,
                            `预计站点冷却等待：约 ${Math.ceil((Math.max(0, detail.runs - 1) * (CONFIG.EXCHANGE_COOLDOWN + 250) + BonusExchange.getCooldownRemaining()) / 1000)} 秒（不含网络提交与核验）`,
                            ...(estimate.pageBonus > 0 ? [`当前魔力值：${formatInteger(estimate.pageBonus)} G`] : []),
                            ...(shortage > 0 ? [`完成全部任务还差：${formatInteger(shortage)} G，余额不足时将停止`] : []),
                        ].join('\n'))) return;
                        manualBtn.textContent = `⏳ 0/${detail.runs}`;
                        showNotification(`已开始后台兑换：共 ${detail.runs} 批，页面无需逐批点击`, 'info', 4000);
                        const result = await BonusExchange.executeManual(gb, type, {
                            parsed: estimate.parsed,
                            onProgress: ({ phase, completedRuns, totalRuns }) => {
                                manualBtn.textContent = phase === 'cooldown'
                                    ? `⏳ 等待 ${completedRuns}/${totalRuns}`
                                    : `⏳ ${completedRuns}/${totalRuns}`;
                            },
                        });
                        if (result.success) {
                            showNotification(`✅ 成功兑换 ${result.gb} GB ${typeName}（${result.runs} 次，消耗 ${result.cost} 魔力值）`, 'success', 6000);
                        } else {
                            const partial = result.partial ? `，已完成 ${result.gb || 0} GB` : '';
                            showNotification(`兑换未完成${partial}: ${result.reason}`, 'error', 6000);
                        }
                    } catch (e) {
                        Log.error('手动兑换异常:', e);
                        showNotification(`兑换异常: ${e.message || e}`, 'error', 6000);
                    } finally {
                        manualBtn.disabled = false;
                        manualBtn.textContent = '⚡ 立即兑换';
                        this.update();
                    }
                });
            }

            // FAQ 按钮
            const faqBtn = document.getElementById('np-btn-faq');
            if (faqBtn) {
                faqBtn.addEventListener('click', () => {
                    const faqUrl = window.location.origin + '/faq.php';
                    if (getPath().endsWith('faq.php')) {
                        FAQParser.parse();
                        this.update();
                        showNotification('FAQ 规则已重新解析', 'info');
                    } else {
                        window.open(faqUrl, '_blank');
                    }
                });
            }

            // 设置按钮
            const settingsBtn = document.getElementById('np-btn-settings');
            if (settingsBtn) {
                settingsBtn.addEventListener('click', () => {
                    this._showSettings();
                });
            }
        },

        /** 设置面板位置 */
        setPosition(pos) {
            const positions = {
                'top-right': 'np-top-right',
                'top-left': 'np-top-left',
                'bottom-right': 'np-bottom-right',
                'bottom-left': 'np-bottom-left',
            };
            const className = positions[pos] || 'np-top-right';
            this.panel.className = className;
        },

        /** 实现拖动 */
        _makeDraggable() {
            const header = document.getElementById('np-panel-header');
            if (!header || !this.panel) return;

            let isDragging = false;
            let startX, startY, origX, origY;

            header.addEventListener('mousedown', (e) => {
                if (e.target.tagName === 'BUTTON') return;
                isDragging = true;
                const rect = this.panel.getBoundingClientRect();
                startX = e.clientX;
                startY = e.clientY;
                origX = rect.left;
                origY = rect.top;
                this.panel.style.left = origX + 'px';
                this.panel.style.top = origY + 'px';
                this.panel.style.right = 'auto';
                this.panel.style.bottom = 'auto';
                this.panel.classList.remove('np-top-right', 'np-top-left', 'np-bottom-right', 'np-bottom-left');
                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
            });

            const onMove = (e) => {
                if (!isDragging) return;
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                this.panel.style.left = (origX + dx) + 'px';
                this.panel.style.top = (origY + dy) + 'px';
            };

            const onUp = () => {
                isDragging = false;
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
            };
        },

        /** 更新面板内容 */
        update() {
            if (!this.panel) return;

            const stats = Storage.getUserStats();
            const rules = Storage.getRules();
            // 每次刷新都重新评估，确保注册时长倒计时不会停留在旧缓存。
            const evaluation = RuleEngine.evaluate();

            // 状态内容
            const statusContent = document.getElementById('np-status-content');
            if (statusContent) {
                if (stats) {
                    const ratioDisplay = stats.ratio === Infinity ? '∞' : stats.ratio.toFixed(3);
                    const ratioClass = stats.ratio >= 1 ? 'good' : (stats.ratio >= 0.6 ? 'warning' : 'danger');
                    const bonusClass = stats.bonus > 10000 ? 'good' : (stats.bonus > 1000 ? 'warning' : 'danger');

                    statusContent.innerHTML = `
                        <div class="np-stat-row">
                            <span class="np-stat-label">等级</span>
                            <span class="np-stat-value">${escapeHTML(formatClassDisplayName(stats.className, stats.classOrder))}</span>
                        </div>
                        <div class="np-stat-row">
                            <span class="np-stat-label">上传</span>
                            <span class="np-stat-value good">↑ ${formatBytes(stats.uploaded)}</span>
                        </div>
                        <div class="np-stat-row">
                            <span class="np-stat-label">下载</span>
                            <span class="np-stat-value">↓ ${formatBytes(stats.downloaded)}</span>
                        </div>
                        <div class="np-stat-row">
                            <span class="np-stat-label">分享率</span>
                            <span class="np-stat-value ${ratioClass}">${ratioDisplay}</span>
                        </div>
                        <div class="np-stat-row">
                            <span class="np-stat-label">魔力值</span>
                            <span class="np-stat-value ${bonusClass}">${stats.bonus?.toFixed(1) || '0'}</span>
                        </div>
                        <div class="np-stat-row">
                            <span class="np-stat-label">注册</span>
                            <span class="np-stat-value">${parseDateFlexible(stats.joinTime) ? `${stats.registeredDays || 0} 天` : '未知'}</span>
                        </div>
                    `;
                } else {
                    statusContent.innerHTML = '<div style="color:#888;text-align:center;padding:8px;">无法获取用户数据<br><small>请刷新页面重试</small></div>';
                }
            }

            // 规则/晋级内容
            const rulesContent = document.getElementById('np-rules-content');
            if (rulesContent) {
                const regProgress = evaluation?.details?.nextPromotion?.regWeeks;
                let registrationCountdownHtml = '';
                if (evaluation?.nextClass && regProgress) {
                    let detail;
                    if (!regProgress.known) {
                        detail = '注册时间未知，无法计算剩余时长';
                    } else if (regProgress.met) {
                        detail = `注册时长已达标 · 条件达标日 ${escapeHTML(regProgress.expectedDate)}`;
                    } else {
                        detail = `还需 ${escapeHTML(regProgress.remainingText)} · 预计 ${escapeHTML(regProgress.expectedDate)} 达标`;
                    }
                    registrationCountdownHtml = `
                        <div class="np-rule-item">
                            <span class="np-rule-class">注册时长 · ${escapeHTML(evaluation.nextClass.className)}</span>
                            <div class="np-rule-detail">${detail}</div>
                        </div>
                    `;
                }

                if (evaluation && evaluation.messages && evaluation.messages.length > 0) {
                    rulesContent.innerHTML = registrationCountdownHtml + evaluation.messages.map(msg =>
                        `<div style="padding:2px 0;font-size:12px;">${msg}</div>`
                    ).join('');
                } else if (rules.length > 0) {
                    const nextClass = rules.find(r => r.order > (stats?.classOrder || 0));
                    if (nextClass) {
                        const prom = nextClass.promotion;
                        const regText = prom.regWeeks ? `注册 ${prom.regWeeks} 周 | ` : '';
                        const dlText = prom.downloadBytes ? `下载 ${(prom.downloadBytes/(1024*1024*1024)).toFixed(0)}GB | ` : '';
                        const ratioText = prom.ratioReq ? `分享率 ≥ ${prom.ratioReq} | ` : '';
                        const bonusText = prom.bonusReq ? `积分 ≥ ${prom.bonusReq}` : '';
                        rulesContent.innerHTML = registrationCountdownHtml + `
                            <div class="np-rule-item">
                                <span class="np-rule-class">下一个: ${escapeHTML(nextClass.className)}</span>
                                <div class="np-rule-detail">${regText}${dlText}${ratioText}${bonusText}</div>
                            </div>
                        `;
                    } else {
                        rulesContent.innerHTML = '<div style="color:#888;font-size:12px;text-align:center;">已解析规则，但未找到下一等级</div>';
                    }
                } else {
                    rulesContent.innerHTML = '<div style="color:#888;font-size:12px;text-align:center;">尚未解析规则<br><small>请访问 FAQ 页面</small></div>';
                }
            }

            this._updatePromotionEstimate(evaluation);
        },

        _updatePromotionEstimate(evaluation) {
            const element = document.getElementById('np-promotion-estimate');
            const plan = evaluation?.exchangePlan;
            if (!element || !plan || (!plan.uploadGB && !plan.downloadGB)) {
                if (element) element.style.display = 'none';
                return;
            }

            const knownBonus = Math.round(Number(Storage.getUserStats()?.bonus) || 0);
            const planKey = `${plan.uploadGB || 0}:${plan.downloadGB || 0}:${knownBonus}`;
            if (element.dataset.planKey === planKey && element.dataset.loaded === 'true') return;
            element.dataset.planKey = planKey;
            element.dataset.loaded = 'false';
            element.style.display = 'block';
            element.textContent = '预计魔力值消耗：正在读取站点 100 GB 档位…';

            BonusExchange.estimatePromotionPlan(evaluation).then(estimate => {
                if (element.dataset.planKey !== planKey) return;
                element.dataset.loaded = 'true';
                if (!estimate.success) {
                    element.textContent = `预计魔力值消耗：暂时无法计算（${estimate.reason}）`;
                    return;
                }
                const detail = formatExchangeEstimateParts(estimate).join('；');
                const shortage = estimate.pageBonus > 0
                    ? Math.max(0, estimate.totalCost - estimate.pageBonus)
                    : 0;
                element.textContent = `预计消耗 ${formatInteger(estimate.totalCost)} G · ${detail}`
                    + (shortage > 0 ? ` · 当前还差 ${formatInteger(shortage)} G` : '');
            }).catch(error => {
                if (element.dataset.planKey !== planKey) return;
                element.dataset.loaded = 'true';
                element.textContent = `预计魔力值消耗：计算失败（${error?.message || error}）`;
            });
        },

        /** 获取缓存的评估结果 */
        _getCachedEvaluation() {
            const stats = Storage.getUserStats();
            if (!stats) return null;
            // 如果内存中有上次评估结果，使用它
            return stats.lastEvaluation || null;
        },

        /** 显示设置对话框 */
        _showSettings() {
            const settings = Storage.getSettings();
            const overlay = document.createElement('div');
            overlay.style.cssText = `
                position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(0,0,0,0.6); z-index: 100001;
                display: flex; align-items: center; justify-content: center;
            `;

            const dialog = document.createElement('div');
            dialog.style.cssText = `
                background: rgba(30, 30, 40, 0.98); border: 1px solid rgba(100, 120, 200, 0.3);
                border-radius: 10px; padding: 20px; width:min(460px, calc(100vw - 32px));
                max-height:calc(100vh - 40px); overflow-y:auto; box-sizing:border-box;
                color: #e0e0e0; font-family: -apple-system, sans-serif; font-size: 13px;
                box-shadow: 0 8px 30px rgba(0,0,0,0.5);
            `;
            dialog.innerHTML = `
                <h3 style="margin:0 0 16px;color:#8ab4f8;">⚙️ 设置</h3>
                <div style="margin-bottom:12px;">
                    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                        <input type="checkbox" id="np-set-auto" ${settings.autoExchange ? 'checked' : ''}>
                        自动兑换魔力值
                    </label>
                </div>
                <div style="margin-bottom:12px;">
                    <label style="display:block;margin-bottom:4px;">兑换策略</label>
                    <select id="np-set-strategy" style="width:100%;padding:6px;background:#222;color:#e0e0e0;border:1px solid #444;border-radius:4px;">
                        <option value="conservative" ${settings.strategy === 'conservative' ? 'selected' : ''}>保守（低频率兑换）</option>
                        <option value="balanced" ${settings.strategy === 'balanced' ? 'selected' : ''}>平衡（默认）</option>
                        <option value="aggressive" ${settings.strategy === 'aggressive' ? 'selected' : ''}>激进（主动兑换）</option>
                    </select>
                </div>
                <div id="np-auto-config" style="margin-bottom:12px;border:1px solid #3a4a6a;border-radius:6px;padding:10px;display:${settings.autoExchange ? 'block' : 'none'};">
                    <div style="margin-bottom:8px;">
                        <label style="display:block;margin-bottom:4px;">自动兑换模式</label>
                        <select id="np-set-automode" style="width:100%;padding:6px;background:#222;color:#e0e0e0;border:1px solid #444;border-radius:4px;">
                            <option value="promotion" ${settings.autoExchangeMode === 'promotion' ? 'selected' : ''}>晋级驱动（按需兑换到下一等级）</option>
                            <option value="fixed" ${settings.autoExchangeMode === 'fixed' ? 'selected' : ''}>定时定额（每隔 N 分钟固定兑换）</option>
                            <option value="amount" ${settings.autoExchangeMode === 'amount' ? 'selected' : ''}>按量完成（选定档位直至目标完成）</option>
                        </select>
                    </div>
                    <div id="np-auto-legacy-config" style="display:${settings.autoExchangeMode === 'amount' ? 'none' : 'block'};">
                        <div style="display:flex;gap:8px;margin-bottom:8px;">
                            <div style="flex:1;">
                                <label style="display:block;margin-bottom:4px;">间隔（分钟）</label>
                                <input type="number" id="np-set-interval" min="10" step="1" value="${settings.autoExchangeIntervalMin || 60}" style="width:100%;padding:6px;background:#222;color:#e0e0e0;border:1px solid #444;border-radius:4px;box-sizing:border-box;">
                            </div>
                            <div style="flex:1;">
                                <label style="display:block;margin-bottom:4px;">定额（GB/次）</label>
                                <input type="number" id="np-set-fixedgb" min="1" step="1" value="${settings.autoExchangeFixedGB || 10}" style="width:100%;padding:6px;background:#222;color:#e0e0e0;border:1px solid #444;border-radius:4px;box-sizing:border-box;">
                            </div>
                            <div style="flex:1;">
                                <label style="display:block;margin-bottom:4px;">定额类型</label>
                                <select id="np-set-fixedtype" style="width:100%;padding:6px;background:#222;color:#e0e0e0;border:1px solid #444;border-radius:4px;">
                                    <option value="upload" ${settings.autoExchangeFixedType !== 'download' ? 'selected' : ''}>上传量</option>
                                    <option value="download" ${settings.autoExchangeFixedType === 'download' ? 'selected' : ''}>下载量</option>
                                </select>
                            </div>
                        </div>
                        <div style="margin-bottom:8px;">
                            <label style="display:block;margin-bottom:4px;">本次上限（GB）</label>
                            <input type="number" id="np-set-maxgb" min="1" step="1" value="${settings.autoExchangeMaxGBPerRun || 100}" style="width:100%;padding:6px;background:#222;color:#e0e0e0;border:1px solid #444;border-radius:4px;box-sizing:border-box;">
                        </div>
                    </div>
                    <div id="np-auto-amount-config" style="display:${settings.autoExchangeMode === 'amount' ? 'block' : 'none'};">
                        <div style="display:flex;gap:8px;margin-bottom:8px;">
                            <div style="flex:1;">
                                <label style="display:block;margin-bottom:4px;">目标兑换量（GB）</label>
                                <input type="number" id="np-set-amountgb" min="100" step="100" value="${settings.autoExchangeAmountGB || ''}" style="width:100%;padding:6px;background:#222;color:#e0e0e0;border:1px solid #444;border-radius:4px;box-sizing:border-box;">
                            </div>
                            <div style="flex:1;">
                                <label style="display:block;margin-bottom:4px;">100 GB 档位</label>
                                <select id="np-set-amounttier" disabled style="width:100%;padding:6px;background:#222;color:#e0e0e0;border:1px solid #444;border-radius:4px;"><option value="">读取本站档位中...</option></select>
                            </div>
                        </div>
                        <div id="np-set-amount-preview" style="margin:-2px 0 8px;color:#a8c7fa;min-height:18px;"></div>
                        <div style="display:flex;gap:8px;margin-bottom:8px;">
                            <div style="flex:1;">
                                <label style="display:block;margin-bottom:4px;">冷却时间</label>
                                <select id="np-set-cooldownmode" style="width:100%;padding:6px;background:#222;color:#e0e0e0;border:1px solid #444;border-radius:4px;">
                                    <option value="auto" ${settings.autoExchangeCooldownMode !== 'manual' ? 'selected' : ''}>自动识别</option>
                                    <option value="manual" ${settings.autoExchangeCooldownMode === 'manual' ? 'selected' : ''}>手动填写</option>
                                </select>
                            </div>
                            <div style="flex:1;">
                                <label style="display:block;margin-bottom:4px;">冷却秒数</label>
                                <input type="number" id="np-set-cooldownsecs" min="1" step="1" value="${settings.autoExchangeCooldownSeconds || 10}" ${settings.autoExchangeCooldownMode === 'manual' ? '' : 'disabled'} style="width:100%;padding:6px;background:#222;color:#e0e0e0;border:1px solid #444;border-radius:4px;box-sizing:border-box;">
                            </div>
                        </div>
                    </div>
                    <div>
                        <label style="display:block;margin-bottom:4px;">保留魔力值</label>
                        <input type="number" id="np-set-keepbonus" min="0" step="1" value="${settings.autoExchangeMinBonusKeep || 0}" style="width:100%;padding:6px;background:#222;color:#e0e0e0;border:1px solid #444;border-radius:4px;box-sizing:border-box;">
                    </div>
                </div>
                <div style="margin-bottom:12px;">
                    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                        <input type="checkbox" id="np-set-demotion" ${settings.demotionWarning !== false ? 'checked' : ''}>
                        降级警告提醒
                    </label>
                </div>
                <div style="margin-bottom:12px;">
                    <label style="display:block;margin-bottom:4px;">面板位置</label>
                    <select id="np-set-position" style="width:100%;padding:6px;background:#222;color:#e0e0e0;border:1px solid #444;border-radius:4px;">
                        <option value="top-right" ${settings.panelPosition === 'top-right' ? 'selected' : ''}>右上角</option>
                        <option value="top-left" ${settings.panelPosition === 'top-left' ? 'selected' : ''}>左上角</option>
                        <option value="bottom-right" ${settings.panelPosition === 'bottom-right' ? 'selected' : ''}>右下角</option>
                        <option value="bottom-left" ${settings.panelPosition === 'bottom-left' ? 'selected' : ''}>左下角</option>
                    </select>
                </div>
                <div style="margin-bottom:16px;">
                    <button class="np-btn" id="np-btn-reparse">📖 重新解析 FAQ</button>
                    <button class="np-btn" id="np-btn-reset" style="margin-left:4px;">🗑️ 重置数据</button>
                </div>
                <div style="display:flex;gap:8px;justify-content:flex-end;">
                    <button class="np-btn" id="np-settings-cancel">取消</button>
                    <button class="np-btn primary" id="np-settings-save">保存</button>
                </div>
            `;

            overlay.appendChild(dialog);
            document.body.appendChild(overlay);

            // 绑定按钮事件
            document.getElementById('np-settings-cancel')?.addEventListener('click', () => overlay.remove());

            // 自动兑换开关切换时显示/隐藏详细配置
            document.getElementById('np-set-auto')?.addEventListener('change', (e) => {
                const cfg = document.getElementById('np-auto-config');
                if (cfg) cfg.style.display = e.target.checked ? 'block' : 'none';
            });

            const modeSelect = document.getElementById('np-set-automode');
            const legacyConfig = document.getElementById('np-auto-legacy-config');
            const amountConfig = document.getElementById('np-auto-amount-config');
            let amountTiersLoaded = false;
            let amountTiersLoading = false;
            const ensureAmountTiers = async () => {
                if (amountTiersLoaded || amountTiersLoading) return;
                amountTiersLoading = true;
                await this._loadAmountTierOptions(dialog, settings.autoExchangeAmountTierKey);
                amountTiersLoaded = !dialog.querySelector('#np-set-amounttier')?.disabled;
                amountTiersLoading = false;
            };
            const syncModeConfig = () => {
                const isAmount = modeSelect?.value === 'amount';
                if (legacyConfig) legacyConfig.style.display = isAmount ? 'none' : 'block';
                if (amountConfig) amountConfig.style.display = isAmount ? 'block' : 'none';
                if (isAmount) ensureAmountTiers();
            };
            modeSelect?.addEventListener('change', syncModeConfig);

            const cooldownMode = document.getElementById('np-set-cooldownmode');
            const cooldownSeconds = document.getElementById('np-set-cooldownsecs');
            const syncCooldownInput = () => {
                if (cooldownSeconds) cooldownSeconds.disabled = cooldownMode?.value !== 'manual';
            };
            cooldownMode?.addEventListener('change', syncCooldownInput);

            document.getElementById('np-settings-save')?.addEventListener('click', () => {
                const num = (id, fallback) => {
                    const v = parseFloat(document.getElementById(id)?.value);
                    return isNaN(v) ? fallback : v;
                };
                const autoExchange = document.getElementById('np-set-auto').checked;
                const autoExchangeMode = modeSelect?.value || 'promotion';
                const amountGB = Math.max(0, num('np-set-amountgb', 0));
                const amountTierSelect = document.getElementById('np-set-amounttier');
                const amountTierKey = amountTierSelect?.value || '';
                const amountTierGB = Number(amountTierSelect?.selectedOptions?.[0]?.dataset.gb) || 0;
                if (autoExchange && autoExchangeMode === 'amount') {
                    if (amountGB < 100) {
                        showNotification('目标兑换量至少为 100 GB', 'warning', 4000);
                        return;
                    }
                    if (!amountTierKey || Math.abs(amountTierGB - 100) >= 0.001) {
                        showNotification('请等待本站 100 GB 档位读取完成并选择上传量或下载量', 'warning', 4000);
                        return;
                    }
                }
                const priorRemaining = Math.max(0, Number(settings.autoExchangeAmountRemainingGB) || 0);
                const resetAmountTask = autoExchangeMode === 'amount' && (
                    settings.autoExchangeMode !== 'amount'
                    || Number(settings.autoExchangeAmountGB) !== amountGB
                    || settings.autoExchangeAmountTierKey !== amountTierKey
                    || (!settings.autoExchange && priorRemaining <= 0)
                );
                const newSettings = {
                    autoExchange,
                    autoExchangeMode,
                    autoExchangeIntervalMin: Math.max(10, num('np-set-interval', 60)),
                    autoExchangeFixedGB: Math.max(1, num('np-set-fixedgb', 10)),
                    autoExchangeFixedType: document.getElementById('np-set-fixedtype')?.value === 'download' ? 'download' : 'upload',
                    autoExchangeAmountGB: amountGB,
                    autoExchangeAmountTierKey: amountTierKey,
                    autoExchangeAmountRemainingGB: autoExchangeMode === 'amount'
                        ? (resetAmountTask ? amountGB : priorRemaining)
                        : priorRemaining,
                    autoExchangeAmountCompletedGB: autoExchangeMode === 'amount'
                        ? (resetAmountTask ? 0 : Math.max(0, Number(settings.autoExchangeAmountCompletedGB) || 0))
                        : Math.max(0, Number(settings.autoExchangeAmountCompletedGB) || 0),
                    autoExchangeCooldownMode: cooldownMode?.value === 'manual' ? 'manual' : 'auto',
                    autoExchangeCooldownSeconds: Math.max(1, num('np-set-cooldownsecs', 10)),
                    autoExchangeMaxGBPerRun: Math.max(1, num('np-set-maxgb', 100)),
                    autoExchangeMinBonusKeep: Math.max(0, num('np-set-keepbonus', 0)),
                    strategy: document.getElementById('np-set-strategy').value,
                    demotionWarning: document.getElementById('np-set-demotion').checked,
                    panelPosition: document.getElementById('np-set-position').value,
                };
                if (newSettings.autoExchange && !settings.autoExchange) {
                    showNotification('自动兑换已开启：将在后台检查兑换条件', 'info', 5000);
                }
                Storage.setSettings(newSettings);
                AutoExchange.scheduleSoon();
                if (newSettings.panelPosition) {
                    this.setPosition(newSettings.panelPosition);
                }
                overlay.remove();
                showNotification('设置已保存', 'success');
            });
            document.getElementById('np-btn-reparse')?.addEventListener('click', () => {
                overlay.remove();
                if (getPath().endsWith('faq.php')) {
                    FAQParser.parse();
                    this.update();
                    showNotification('FAQ 已重新解析', 'info');
                } else {
                    window.open(window.location.origin + '/faq.php', '_blank');
                }
            });
            document.getElementById('np-btn-reset')?.addEventListener('click', () => {
                if (confirm('确定要清除所有存储数据吗？')) {
                    Storage.delete('RULES');
                    Storage.delete('USER_STATS');
                    Storage.delete('LAST_EXCHANGE');
                    Storage.delete('PARSED_FAQ');
                    this.update();
                    overlay.remove();
                    showNotification('数据已重置', 'info');
                }
            });

            // 点击遮罩关闭
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) overlay.remove();
            });

            if (modeSelect?.value === 'amount') ensureAmountTiers();
        },

        /** 读取站点档位仅使用 GET；选项值不由页面 HTML 直接拼接，避免注入。 */
        async _loadAmountTierOptions(dialog, selectedKey) {
            const select = dialog.querySelector('#np-set-amounttier');
            if (!select) return;
            try {
                const parsed = await BonusExchange._getTiers();
                const tiers = parsed?.tiers?.filter(t =>
                    (t.type === 'upload' || t.type === 'download')
                    && Math.abs(t.gb - 100) < 0.001
                ) || [];
                select.replaceChildren();
                if (!tiers.length) throw new Error('未找到 100 GB 上传量或下载量兑换档位');
                for (const tier of tiers) {
                    const option = document.createElement('option');
                    option.value = AutoExchange._tierKey(tier);
                    option.dataset.gb = String(tier.gb);
                    option.dataset.cost = String(tier.cost);
                    option.textContent = `${tier.type === 'download' ? '下载量' : '上传量'} ${tier.gb} GB（${tier.cost} 魔力值）`;
                    option.selected = option.value === selectedKey;
                    select.appendChild(option);
                }
                if (!select.value) select.selectedIndex = 0;
                select.disabled = false;
                const refreshPreview = () => this._updateAmountPlanPreview(dialog);
                dialog.querySelector('#np-set-amountgb')?.addEventListener('input', refreshPreview);
                select.addEventListener('change', refreshPreview);
                refreshPreview();
            } catch (e) {
                select.replaceChildren();
                const option = document.createElement('option');
                option.value = '';
                option.textContent = '读取本站档位失败';
                select.appendChild(option);
                select.disabled = true;
                Log.warn('读取按量兑换档位失败:', e);
            }
        },

        _updateAmountPlanPreview(dialog) {
            const preview = dialog.querySelector('#np-set-amount-preview');
            const amount = Number(dialog.querySelector('#np-set-amountgb')?.value) || 0;
            const option = dialog.querySelector('#np-set-amounttier')?.selectedOptions?.[0];
            const tierGB = Number(option?.dataset.gb) || 0;
            const cost = Number(option?.dataset.cost) || 0;
            if (!preview) return;
            if (!amount || !tierGB) {
                preview.textContent = '';
                return;
            }
            const count = Math.ceil(amount / tierGB);
            preview.textContent = `预计 ${count} 次，实际兑换 ${count * tierGB} GB，约消耗 ${count * cost} 魔力值`;
        },
    };

    // ============================================================
    // 14.  MAIN ENTRY POINT
    // ============================================================

    async function main() {
        if (window.top !== window.self) return;
        Log.info('NexusPHP PT 自动晋级助手 启动');

        // 检查是否为 NexusPHP 站点
        if (!isNexusPHP()) {
            Log.debug('非 NexusPHP 站点，跳过');
            return;
        }

        // 已知站点在任何页面都先加载权威等级 metadata，不要求用户先访问 FAQ。
        const canonicalRules = ensureCanonicalSiteRules();
        if (canonicalRules.length > 0) {
            Log.info(`已加载 ${canonicalRules.length} 个站点等级规则`);
        }

        const pageType = getPageType();
        Log.info(`页面类型: ${pageType}`);

        // 注册菜单命令（样式由 Panel.init() 注入）
        GM_registerMenuCommand('📊 显示/隐藏面板', () => {
            const panel = document.getElementById('np-panel');
            if (panel) {
                panel.classList.toggle('np-hidden');
            } else {
                Panel.init();
            }
        });
        GM_registerMenuCommand('📖 解析 FAQ 规则', () => {
            if (getCanonicalSiteRules(window.location.hostname).length > 0 || pageType === 'faq') {
                FAQParser.parse();
                Panel.update();
                showNotification(
                    getCanonicalSiteRules(window.location.hostname).length > 0 ? '站点等级规则已加载' : 'FAQ 规则已解析',
                    'info'
                );
            } else {
                showNotification('请先访问 FAQ 页面 (faq.php)', 'warning', 3000);
            }
        });
        GM_registerMenuCommand('💱 执行晋级兑换', async () => {
            const result = await BonusExchange.executeExchange({
                confirmTimeUnmet: confirmTimeUnmetExchange,
            });
            if (result.success) {
                showNotification(`✅ 兑换完成: ${result.message || '成功'}`, 'success', 6000);
            } else if (result.cancelled) {
                showNotification('已取消提前兑换', 'info', 3000);
            } else {
                showNotification(`兑换未执行: ${result.reason}`, 'warning', 5000);
            }
            Panel.update();
        });

        // 根据页面类型执行不同操作
        // 注意：每个 case 使用 {} 包裹以避免 const 声明冲突
        switch (pageType) {
            case 'faq': {
                Log.info('FAQ 页面 - 解析晋级/降级规则');
                await sleep(500);
                const rules = FAQParser.parse();
                if (rules.length > 0) {
                    showNotification(`已解析 ${rules.length} 个等级规则`, 'success', 3000);
                } else {
                    showNotification('未找到晋级规则，请确认 FAQ 中包含等级说明', 'warning', 4000);
                }
                await UserStats.collect();
                Panel.init();
                break;
            }

            case 'index':
            case 'userdetails': {
                Log.info('用户页面 - 收集状态并评估');
                await sleep(300);
                await UserStats.collect();
                const hasRules = Storage.getRules();
                if (hasRules && hasRules.length > 0) {
                    const evalResult = RuleEngine.evaluate();
                    if (evalResult.messages.length > 0) {
                        const importantMsg = evalResult.messages.find(m => m.includes('⚠️') || m.includes('✅'));
                        if (importantMsg) {
                            const notifType = importantMsg.includes('⚠️') ? 'warning' : 'success';
                            showNotification(importantMsg, notifType, 5000);
                        }
                    }
                }
                Panel.init();
                break;
            }

            case 'bonus': {
                Log.info('魔力值页面 - 准备兑换');
                // 站点原生兑换成功会导航到 ?do=upload / ?do=download。
                // 将这次真实操作同步到脚本的 10 秒冷却，避免页面刚加载就重复提交。
                const pageText = document.body?.innerText || document.body?.textContent || '';
                const nativeExchangeSuccess = /祝贺你[^。！\n]*(?:成功增加|成功兑换)[^。！\n]*(?:上传值|下载值|上传量|下载量)/.test(pageText);
                if (nativeExchangeSuccess) Storage.setLastExchange(Date.now());
                await sleep(300);
                await UserStats.collect();
                Panel.init();

                const evalResult = RuleEngine.evaluate();
                if (evalResult.needsExchange && evalResult.exchangePlan) {
                    const p = evalResult.exchangePlan;
                    const parts = [];
                    if (p.downloadGB > 0) parts.push(`下载量 ${p.downloadGB} GB`);
                    if (p.uploadGB > 0) parts.push(`上传量 ${p.uploadGB} GB`);
                    showNotification(`检测到晋级缺口: ${parts.join(' + ')}，点击面板"🎯 晋级兑换"执行`, 'info', 6000);
                }
                break;
            }

            default: {
                await UserStats.collect();
                Panel.init();
                break;
            }
        }

        // 如果页面有面板，定期刷新
        if (document.getElementById('np-panel')) {
            setInterval(async () => {
                await UserStats.collect();
                Panel.update();
            }, CONFIG.STATS_REFRESH_INTERVAL);
        }

        // 启动自动兑换调度器（开关在设置面板，默认关闭）
        AutoExchange.start();
    }

    // ============================================================
    // 15.  STARTUP
    // ============================================================

    // 等待 DOM 就绪
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', main);
    } else {
        main();
    }

})();
