'use strict';

const Desklet  = imports.ui.desklet;
const Settings = imports.ui.settings;
const St       = imports.gi.St;
const Clutter  = imports.gi.Clutter;
const Mainloop = imports.mainloop;

/* ------------------------------------------------------------------ */
/* Settings keys                                                      */
/* ------------------------------------------------------------------ */

const CFG_KEYS = [
    'eventName',
    'eventDay', 'eventMonth', 'eventYear',
    'eventIncludeHour', 'eventHour', 'eventMinute',
    'displayMode', 'useDecimals',
    'language', 'compact',
    'width', 'height', 'fontSize', 'uiScale',
    'bgColor', 'cardBgColor', 'textColor', 'accentColor', 'borderColor',
    'opacity', 'borderWidth', 'borderRadius',
    'deskletTitle',
];

const MODES = ['breakdown', 'years', 'months', 'weeks', 'days', 'hours'];

/* ------------------------------------------------------------------ */
/* Translations                                                       */
/* ------------------------------------------------------------------ */

const I18N = {
    tr: {
        years: 'YIL',
        months: 'AY',
        weeks: 'HAFTA',
        days: 'GÜN',
        hours: 'SAAT',
        minutes: 'DAKİKA',
        yearsLeft: 'YIL KALDI',
        monthsLeft: 'AY KALDI',
        weeksLeft: 'HAFTA KALDI',
        daysLeft: 'GÜN KALDI',
        hoursLeft: 'SAAT KALDI',
        arrived: 'Zamanı Geldi!',
        passed: 'Süre Doldu',
        today: 'BUGÜN!',
        targetPrefix: 'Hedef: ',
        totalDaysLabel: function (d) { return 'Toplam ' + d + ' gün'; },
        totalDaysApprox: function (d) { return 'Toplam ~' + d + ' gün'; },
        monthsShort: ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']
    },
    en: {
        years: 'YEARS',
        months: 'MONTHS',
        weeks: 'WEEKS',
        days: 'DAYS',
        hours: 'HOURS',
        minutes: 'MINS',
        yearsLeft: 'YEARS LEFT',
        monthsLeft: 'MONTHS LEFT',
        weeksLeft: 'WEEKS LEFT',
        daysLeft: 'DAYS LEFT',
        hoursLeft: 'HOURS LEFT',
        arrived: 'Event Arrived!',
        passed: 'Time Passed',
        today: 'TODAY!',
        targetPrefix: 'Target: ',
        totalDaysLabel: function (d) { return 'Total ' + d + ' days'; },
        totalDaysApprox: function (d) { return 'Total ~' + d + ' days'; },
        monthsShort: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    }
};

/* ------------------------------------------------------------------ */
/* Time & Countdown Calculations                                      */
/* ------------------------------------------------------------------ */

function getTargetDate(y, m, d, incHour, h, min) {
    const yr  = parseInt(y, 10) || (new Date().getFullYear() + 1);
    const mo  = Math.min(12, Math.max(1, parseInt(m, 10) || 1));
    const day = Math.min(31, Math.max(1, parseInt(d, 10) || 1));
    const hr  = incHour ? Math.min(23, Math.max(0, parseInt(h, 10) || 0)) : 0;
    const mn  = incHour ? Math.min(59, Math.max(0, parseInt(min, 10) || 0)) : 0;
    return new Date(yr, mo - 1, day, hr, mn, 0, 0);
}

function addCalendarMonths(date, months) {
    const d = new Date(date.getTime());
    const expectedMonth = ((d.getMonth() + months) % 12 + 12) % 12;
    d.setMonth(d.getMonth() + months);
    if (d.getMonth() !== expectedMonth) {
        d.setDate(0);
    }
    return d;
}

function addCalendarYears(date, years) {
    return addCalendarMonths(date, years * 12);
}

function calculateCountdown(now, target) {
    const diffMs = target.getTime() - now.getTime();
    if (diffMs <= 0) {
        return {
            isPassed: true,
            diffMs: diffMs,
            totalDays: 0,
            years: 0,
            months: 0,
            weeks: 0,
            days: 0,
            hours: 0,
            minutes: 0
        };
    }

    let cur = new Date(now.getTime());
    let years = 0;
    while (true) {
        let next = addCalendarYears(cur, 1);
        if (next <= target) {
            years++;
            cur = next;
        } else {
            break;
        }
    }

    let months = 0;
    while (true) {
        let next = addCalendarMonths(cur, 1);
        if (next <= target) {
            months++;
            cur = next;
        } else {
            break;
        }
    }

    const remMs = target.getTime() - cur.getTime();
    const remDays = Math.floor(remMs / (1000 * 60 * 60 * 24));
    const weeks = Math.floor(remDays / 7);
    const days = remDays % 7;

    const msAfterDays = remMs - (remDays * 1000 * 60 * 60 * 24);
    const hours = Math.floor(msAfterDays / (1000 * 60 * 60));
    const minutes = Math.floor((msAfterDays % (1000 * 60 * 60)) / (1000 * 60));
    const totalDays = diffMs / (1000 * 60 * 60 * 24);

    return {
        isPassed: false,
        diffMs: diffMs,
        totalDays: totalDays,
        years: years,
        months: months,
        weeks: weeks,
        days: days,
        hours: hours,
        minutes: minutes
    };
}

/* ------------------------------------------------------------------ */
/* Main Desklet                                                        */
/* ------------------------------------------------------------------ */

function MyDesklet(metadata, desklet_id) {
    this._init(metadata, desklet_id);
}

MyDesklet.prototype = {
    __proto__: Desklet.Desklet.prototype,

    _init: function (metadata, desklet_id) {
        Desklet.Desklet.prototype._init.call(this, metadata, desklet_id);
        this.instanceId  = desklet_id;
        this._cfgIdle    = null;
        this._renderIdle = null;
        this._timer      = null;

        try {
            this._setup(metadata, desklet_id);
        } catch (e) {
            global.logError('[event-countdown] startup error: ' + e + '\n' + (e && e.stack ? e.stack : ''));
            try {
                this.setContent(new St.Label({
                    text: 'Desklet failed to start:\n' + e,
                    style: 'color:#ff7b72; padding:8px; background-color:rgba(0,0,0,0.6);'
                }));
            } catch (e2) { /* ignore */ }
        }
    },

    _setup: function (metadata, desklet_id) {
        this.instance_id = desklet_id;
        this.instanceId  = desklet_id;
        this.settings = new Settings.DeskletSettings(this, metadata.uuid, desklet_id);
        this._ensureSettingsRegistered(metadata.uuid, desklet_id);

        // Re-ensure settings registration after any previous instance's destroy animation finishes
        this._regTimer = Mainloop.timeout_add(450, function () {
            this._regTimer = null;
            this._ensureSettingsRegistered(metadata.uuid, desklet_id);
            return false;
        }.bind(this));

        CFG_KEYS.forEach(function (k) {
            this.settings.bindProperty(Settings.BindingDirection.IN, k, 'cfg_' + k, this._onCfgChanged.bind(this));
        }, this);

        this._buildUi();
        this._applyTheme();
        this._render();

        // Periodic timer to keep countdown fresh
        this._timer = Mainloop.timeout_add_seconds(30, function () {
            this._render();
            return true;
        }.bind(this));
    },

    _ensureSettingsRegistered: function (uuid, desklet_id) {
        try {
            const Main = imports.ui.main;
            if (Main && Main.settingsManager && this.settings) {
                Main.settingsManager.register(uuid, desklet_id, this.settings);
                Main.settingsManager.register(uuid, String(desklet_id), this.settings);
                Main.settingsManager.register(uuid, uuid, this.settings);
            }
        } catch (e) { /* ignore */ }
    },

    _buildUi: function () {
        this._root = new St.BoxLayout({ vertical: true, style_class: 'event-root' });
        this.setContent(this._root);
    },

    _t: function () {
        const lang = (this.cfg_language === 'en') ? 'en' : 'tr';
        return I18N[lang];
    },

    _applyTheme: function () {
        const compact = !!this.cfg_compact;
        const w  = Math.max(160, +(this.cfg_width)        || (compact ? 280 : 360));
        const h  = Math.max(90,  +(this.cfg_height)       || (compact ? 130 : 180));
        const fs = Math.max(8,   +(this.cfg_fontSize)     || 13);
        const op = Math.min(1, Math.max(0, (+(this.cfg_opacity) || 92) / 100));
        const bw = Math.max(0,   +(this.cfg_borderWidth)  || 1);
        const br = Math.max(0,   +(this.cfg_borderRadius) || 14);
        const bg = this.cfg_bgColor     || 'rgb(28,30,36)';
        const fg = this.cfg_textColor   || 'rgb(236,238,242)';
        const bc = this.cfg_borderColor || 'rgba(255,255,255,0.15)';
        const pad = compact ? '8px 12px;' : '12px 16px;';

        this._root.style =
            'width:'            + w  + 'px;' +
            'min-height:'       + h  + 'px;' +
            'font-size:'        + fs + 'px;' +
            'color:'            + fg + ';' +
            'background-color:' + bg + ';' +
            'border:'           + bw + 'px solid ' + bc + ';' +
            'border-radius:'    + br + 'px;' +
            'opacity:'          + op + ';' +
            'padding:'          + pad;
    },

    /* ---- render ---- */

    _render: function () {
        this._root.get_children().forEach(function (c) {
            this._root.remove_actor(c);
        }, this);

        const t = this._t();
        const compact = !!this.cfg_compact;
        const fs = Math.max(8, +(this.cfg_fontSize) || 13);
        const accent = this.cfg_accentColor || 'rgb(79,157,222)';
        const cardBg = this.cfg_cardBgColor || 'rgba(255,255,255,0.08)';
        const cardBorder = this.cfg_borderColor || 'rgba(255,255,255,0.12)';
        const textCol = this.cfg_textColor || 'rgb(236,238,242)';

        const now = new Date();
        const target = getTargetDate(
            this.cfg_eventYear,
            this.cfg_eventMonth,
            this.cfg_eventDay,
            !!this.cfg_eventIncludeHour,
            this.cfg_eventHour,
            this.cfg_eventMinute
        );

        const info = calculateCountdown(now, target);

        // Header Row: Title & Subtitle on left, Mode Button on right
        const headerRow = new St.BoxLayout({
            vertical: false,
            style_class: 'event-header',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER
        });
        headerRow.style = 'margin-bottom:' + (compact ? '8px;' : '12px;');

        const titleBox = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER
        });

        const titleText = this.cfg_deskletTitle || this.cfg_eventName || 'Event';
        const titleLbl = new St.Label({
            text: titleText,
            style_class: 'event-title'
        });
        titleLbl.style = 'font-weight:bold; font-size:' + Math.round(fs * 1.15) + 'px; color:' + textCol + ';';
        titleBox.add_actor(titleLbl);

        // Target Date subtitle
        const monthName = t.monthsShort[target.getMonth()] || (target.getMonth() + 1);
        let dateStr = target.getDate() + ' ' + monthName + ' ' + target.getFullYear();
        if (this.cfg_eventIncludeHour) {
            const padZ = function (n) { return (n < 10 ? '0' : '') + n; };
            dateStr += ' ' + padZ(target.getHours()) + ':' + padZ(target.getMinutes());
        }
        const subLbl = new St.Label({
            text: t.targetPrefix + dateStr,
            style_class: 'event-subtitle'
        });
        subLbl.style = 'font-size:' + Math.round(fs * 0.82) + 'px; opacity:0.75; color:' + textCol + ';';
        titleBox.add_actor(subLbl);

        headerRow.add_actor(titleBox);

        // Buttons container on header right
        const btnBox = new St.BoxLayout({
            vertical: false,
            style_class: 'event-btn-box',
            y_align: Clutter.ActorAlign.START
        });

        // Small Mode Button ("küçük mod tuşu") — icon only
        const currentMode = this.cfg_displayMode || 'breakdown';

        const modeBtn = new St.Button({
            label: '⇋',
            reactive: true,
            can_focus: true,
            style_class: 'event-mode-btn',
            y_align: Clutter.ActorAlign.START
        });
        modeBtn.style =
            'font-size:' + Math.round(fs * 0.82) + 'px;' +
            'font-weight:600;' +
            'color:' + accent + ';' +
            'background-color:' + cardBg + ';' +
            'border:1px solid ' + cardBorder + ';' +
            'border-radius:6px;' +
            'padding:' + (compact ? '2px 6px;' : '3px 9px;') +
            'margin-left:6px;';

        modeBtn.connect('clicked', this._onModeButtonClicked.bind(this));
        btnBox.add_actor(modeBtn);

        // Small Format Button ("buçuklu mu yoksa küçüğü şeklinde mi")
        const isDecimal = this.cfg_useDecimals !== false;
        const formatBtn = new St.Button({
            label: isDecimal ? '½' : '▾',
            reactive: true,
            can_focus: true,
            style_class: 'event-format-btn',
            y_align: Clutter.ActorAlign.START
        });
        formatBtn.style =
            'font-size:' + Math.round(fs * 0.82) + 'px;' +
            'font-weight:600;' +
            'color:' + (isDecimal ? accent : textCol) + ';' +
            'background-color:' + cardBg + ';' +
            'border:1px solid ' + cardBorder + ';' +
            'border-radius:6px;' +
            'padding:' + (compact ? '2px 6px;' : '3px 9px;') +
            'margin-left:5px;';

        formatBtn.connect('clicked', this._onFormatButtonClicked.bind(this));
        btnBox.add_actor(formatBtn);

        headerRow.add_actor(btnBox);

        this._root.add_actor(headerRow);

        // Body: Content based on displayMode
        if (currentMode === 'breakdown') {
            this._renderBreakdown(info, t, fs, accent, cardBg, cardBorder, textCol, compact);
        } else {
            this._renderSingleUnit(currentMode, info, t, fs, accent, cardBg, cardBorder, textCol, compact);
        }
    },

    /* ---- Breakdown Cards Mode (Only > 0 parameters get cards) ---- */

    _renderBreakdown: function (info, t, fs, accent, cardBg, cardBorder, textCol, compact) {
        const cardsBox = new St.BoxLayout({
            vertical: false,
            style_class: 'event-cards-container',
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER
        });

        const cards = [];
        if (info.years > 0) {
            cards.push({ val: info.years, unit: t.years });
        }
        if (info.months > 0) {
            cards.push({ val: info.months, unit: t.months });
        }
        if (info.weeks > 0) {
            cards.push({ val: info.weeks, unit: t.weeks });
        }
        if (info.days > 0) {
            cards.push({ val: info.days, unit: t.days });
        }

        // If hours are enabled and no year/month card or few cards, and hours > 0
        if (this.cfg_eventIncludeHour && info.hours > 0 && cards.length < 4) {
            cards.push({ val: info.hours, unit: t.hours });
        }

        // If all parameters are 0
        if (cards.length === 0) {
            if (info.isPassed) {
                cards.push({ val: '✔', unit: t.arrived, isStatus: true });
            } else {
                if (this.cfg_eventIncludeHour && info.hours > 0) {
                    cards.push({ val: info.hours, unit: t.hours });
                } else if (this.cfg_eventIncludeHour && info.minutes > 0) {
                    cards.push({ val: info.minutes, unit: t.minutes });
                } else {
                    cards.push({ val: '0', unit: t.today });
                }
            }
        }

        cards.forEach(function (c) {
            const card = new St.BoxLayout({
                vertical: true,
                style_class: 'event-card',
                x_expand: true,
                y_align: Clutter.ActorAlign.CENTER,
                x_align: Clutter.ActorAlign.CENTER
            });

            const pad = compact ? '6px 8px;' : '10px 14px;';
            card.style =
                'background-color:' + cardBg + ';' +
                'border:1px solid ' + cardBorder + ';' +
                'border-radius:10px;' +
                'padding:' + pad +
                'margin:3px;' +
                'min-width:' + (compact ? '48px;' : '62px;');

            const valLbl = new St.Label({
                text: String(c.val),
                style_class: 'event-card-val'
            });
            const valFs = c.isStatus ? Math.round(fs * 1.5) : Math.round(fs * 2.1);
            valLbl.style =
                'font-size:' + valFs + 'px;' +
                'font-weight:bold;' +
                'color:' + accent + ';' +
                'text-align:center;';
            card.add_actor(valLbl);

            const unitLbl = new St.Label({
                text: c.unit,
                style_class: 'event-card-unit'
            });
            unitLbl.style =
                'font-size:' + Math.max(9, Math.round(fs * 0.78)) + 'px;' +
                'font-weight:600;' +
                'opacity:0.85;' +
                'color:' + textCol + ';' +
                'text-align:center;' +
                'margin-top:2px;';
            card.add_actor(unitLbl);

            cardsBox.add_actor(card);
        });

        this._root.add_actor(cardsBox);
    },

    /* ---- Single Unit Mode (Years, Months, Weeks, Days, Hours) ---- */

    _renderSingleUnit: function (mode, info, t, fs, accent, cardBg, cardBorder, textCol, compact) {
        const container = new St.BoxLayout({
            vertical: true,
            style_class: 'event-single-container',
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER
        });

        const heroCard = new St.BoxLayout({
            vertical: true,
            style_class: 'event-card',
            x_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER
        });

        const pad = compact ? '8px 16px;' : '14px 24px;';
        heroCard.style =
            'background-color:' + cardBg + ';' +
            'border:1px solid ' + cardBorder + ';' +
            'border-radius:12px;' +
            'padding:' + pad +
            'margin:4px;' +
            'min-width:' + (compact ? '120px;' : '160px;');

        let mainValStr = '0';
        let unitStr = '';
        let subStr = '';

        const isDecimal = this.cfg_useDecimals !== false;

        if (info.isPassed) {
            mainValStr = '✔';
            unitStr = t.arrived;
        } else if (isDecimal) {
            // Buçuklu / Decimal modu
            if (mode === 'years') {
                const val = info.totalDays / 365.25;
                mainValStr = val >= 10 ? String(Math.round(val)) : val.toFixed(1);
                unitStr = t.yearsLeft;
                subStr = t.totalDaysApprox(Math.floor(info.totalDays));
            } else if (mode === 'months') {
                const val = info.totalDays / 30.4375;
                mainValStr = val >= 10 ? String(Math.round(val)) : val.toFixed(1);
                unitStr = t.monthsLeft;
                subStr = t.totalDaysApprox(Math.floor(info.totalDays));
            } else if (mode === 'weeks') {
                const val = info.totalDays / 7;
                mainValStr = val >= 10 ? String(Math.floor(val)) : val.toFixed(1);
                unitStr = t.weeksLeft;
                subStr = t.totalDaysApprox(Math.floor(info.totalDays));
            } else if (mode === 'days') {
                const val = info.totalDays;
                mainValStr = (val % 1 !== 0 && this.cfg_eventIncludeHour) ? val.toFixed(1) : String(Math.floor(val));
                unitStr = t.daysLeft;
                subStr = (info.totalDays / 7).toFixed(1) + ' ' + t.weeks.toLowerCase();
            } else if (mode === 'hours') {
                const totalHours = Math.floor(info.diffMs / (1000 * 60 * 60));
                mainValStr = String(totalHours);
                unitStr = t.hoursLeft;
                subStr = t.totalDaysApprox(Math.floor(info.totalDays));
            }
        } else {
            // Küçüğü şeklinde modu (Tam birim + bir alt birim, örn: 1 Ay 15 Gün)
            if (mode === 'years') {
                const y = info.years;
                const m = info.months;
                if (y > 0 && m > 0) {
                    mainValStr = y + ' ' + t.years.toLowerCase() + ' ' + m + ' ' + t.months.toLowerCase();
                } else if (y > 0) {
                    mainValStr = y + ' ' + t.years.toLowerCase() + (info.days > 0 ? (' ' + info.days + ' ' + t.days.toLowerCase()) : '');
                } else {
                    mainValStr = m + ' ' + t.months.toLowerCase() + (info.days > 0 ? (' ' + info.days + ' ' + t.days.toLowerCase()) : '');
                }
                unitStr = t.yearsLeft;
                subStr = t.totalDaysLabel(Math.floor(info.totalDays));
            } else if (mode === 'months') {
                // Örneğin 45 gün: 1 Ay 15 Gün (alt bilgi: Toplam 45 gün)
                const totalMonths = (info.years * 12) + info.months;
                const remDays = (info.weeks * 7) + info.days;
                if (totalMonths > 0 && remDays > 0) {
                    mainValStr = totalMonths + ' ' + t.months.toLowerCase() + ' ' + remDays + ' ' + t.days.toLowerCase();
                } else if (totalMonths > 0) {
                    mainValStr = totalMonths + ' ' + t.months.toLowerCase();
                } else {
                    mainValStr = remDays + ' ' + t.days.toLowerCase();
                }
                unitStr = t.monthsLeft;
                subStr = t.totalDaysLabel(Math.floor(info.totalDays));
            } else if (mode === 'weeks') {
                const totalWeeks = Math.floor(info.totalDays / 7);
                const remDays = Math.floor(info.totalDays % 7);
                if (totalWeeks > 0 && remDays > 0) {
                    mainValStr = totalWeeks + ' ' + t.weeks.toLowerCase() + ' ' + remDays + ' ' + t.days.toLowerCase();
                } else if (totalWeeks > 0) {
                    mainValStr = totalWeeks + ' ' + t.weeks.toLowerCase();
                } else {
                    mainValStr = remDays + ' ' + t.days.toLowerCase();
                }
                unitStr = t.weeksLeft;
                subStr = t.totalDaysLabel(Math.floor(info.totalDays));
            } else if (mode === 'days') {
                const d = Math.floor(info.totalDays);
                const h = info.hours;
                if (d > 0 && h > 0) {
                    mainValStr = d + ' ' + t.days.toLowerCase() + ' ' + h + ' ' + t.hours.toLowerCase();
                } else if (d > 0) {
                    mainValStr = d + ' ' + t.days.toLowerCase();
                } else {
                    mainValStr = h + ' ' + t.hours.toLowerCase() + ' ' + info.minutes + ' ' + t.minutes.toLowerCase();
                }
                unitStr = t.daysLeft;
                subStr = t.totalDaysLabel(Math.floor(info.totalDays));
            } else if (mode === 'hours') {
                const totalH = Math.floor(info.diffMs / (1000 * 60 * 60));
                const remM = Math.floor((info.diffMs % (1000 * 60 * 60)) / (1000 * 60));
                mainValStr = totalH + ' ' + t.hours.toLowerCase() + ' ' + remM + ' ' + t.minutes.toLowerCase();
                unitStr = t.hoursLeft;
                subStr = t.totalDaysLabel(Math.floor(info.totalDays));
            }
        }

        const valLen = mainValStr.length;
        let heroFs = Math.round(fs * 2.8);
        if (valLen > 12) {
            heroFs = Math.round(fs * 1.6);
        } else if (valLen > 7) {
            heroFs = Math.round(fs * 2.1);
        }

        const valLbl = new St.Label({
            text: mainValStr,
            style_class: 'event-card-val'
        });
        valLbl.style =
            'font-size:' + heroFs + 'px;' +
            'font-weight:bold;' +
            'color:' + accent + ';' +
            'text-align:center;';
        heroCard.add_actor(valLbl);

        const unitLbl = new St.Label({
            text: unitStr,
            style_class: 'event-card-unit'
        });
        unitLbl.style =
            'font-size:' + Math.round(fs * 0.95) + 'px;' +
            'font-weight:bold;' +
            'opacity:0.9;' +
            'color:' + textCol + ';' +
            'text-align:center;' +
            'margin-top:2px;';
        heroCard.add_actor(unitLbl);

        if (subStr) {
            const subLbl = new St.Label({ text: subStr });
            subLbl.style =
                'font-size:' + Math.round(fs * 0.78) + 'px;' +
                'opacity:0.65;' +
                'color:' + textCol + ';' +
                'text-align:center;' +
                'margin-top:4px;';
            heroCard.add_actor(subLbl);
        }

        container.add_actor(heroCard);
        this._root.add_actor(container);
    },

    /* ---- Mode cycling with "küçük mod tuşu" ---- */

    _onModeButtonClicked: function () {
        const activeModes = this.cfg_eventIncludeHour ? MODES : ['breakdown', 'years', 'months', 'weeks', 'days'];
        const currentMode = this.cfg_displayMode || 'breakdown';
        let idx = activeModes.indexOf(currentMode);
        if (idx === -1) idx = 0;
        const nextMode = activeModes[(idx + 1) % activeModes.length];

        // Persist to desklet settings so it syncs with Cinnamon Settings dialog
        try {
            this.settings.setValue('displayMode', nextMode);
        } catch (e) {
            this.cfg_displayMode = nextMode;
        }

        this._render();
    },

    /* ---- Format toggle ("buçuklu mu yoksa küçüğü şeklinde mi") ---- */

    _onFormatButtonClicked: function () {
        const nextVal = !(this.cfg_useDecimals !== false);

        try {
            this.settings.setValue('useDecimals', nextVal);
        } catch (e) {
            this.cfg_useDecimals = nextVal;
        }

        this._render();
    },

    /* ---- settings change ---- */

    _onCfgChanged: function () {
        if (this._cfgIdle) return;
        this._cfgIdle = Mainloop.idle_add(function () {
            this._cfgIdle = null;
            this._applyTheme();
            this._render();
            return false;
        }.bind(this));
    },

    /* ---- lifecycle ---- */

    on_desklet_removed: function () {
        if (this._timer)      { Mainloop.source_remove(this._timer);      this._timer      = null; }
        if (this._cfgIdle)    { Mainloop.source_remove(this._cfgIdle);    this._cfgIdle    = null; }
        if (this._renderIdle) { Mainloop.source_remove(this._renderIdle); this._renderIdle = null; }
        if (this._regTimer)   { Mainloop.source_remove(this._regTimer);   this._regTimer   = null; }

        try {
            const DeskletManager = imports.ui.deskletManager;
            const current = DeskletManager.get_object_for_instance(this.instanceId || this.instance_id);
            if (!current || current === this) {
                this.settings.finalize();
            }
        } catch (e) {
            try { this.settings.finalize(); } catch (e2) { /* ignore */ }
        }
    }
};

function main(metadata, desklet_id) {
    return new MyDesklet(metadata, desklet_id);
}
