"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const birthday_1 = require("../../utils/birthday");
Component({
    properties: {
        value: { type: String, value: "" },
        calendar: { type: String, value: "solar" },
        leapMonth: { type: Boolean, value: false },
        disabled: { type: Boolean, value: false }
    },
    data: { lunarRange: [birthday_1.lunarMonths, birthday_1.lunarDays], lunarValue: [0, 0], dateLabel: "", solarValue: "", today: "" },
    lifetimes: { attached() { this.syncBirthday(this.data.value, this.data.calendar, this.data.leapMonth); } },
    observers: {
        "value, calendar, leapMonth"(value, calendar, leapMonth) {
            this.syncBirthday(value, calendar, leapMonth);
        }
    },
    methods: {
        syncBirthday(value, calendar, leapMonth) {
            const [, month, day] = value.split("-").map(Number);
            const now = new Date(), today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
            this.setData({
                lunarValue: [Math.max(0, Math.min(11, (month || 1) - 1)), Math.max(0, Math.min(29, (day || 1) - 1))],
                dateLabel: (0, birthday_1.birthdayLabel)(value, calendar === "lunar" ? "lunar" : "solar", leapMonth),
                solarValue: value.startsWith("0000-") ? `2000-${value.slice(5)}` : value || today,
                today
            });
        },
        onCalendarChange(e) {
            const calendar = e.currentTarget.dataset.calendar;
            if (this.data.disabled || calendar === this.data.calendar || !["solar", "lunar"].includes(calendar))
                return;
            // Changing a label must never silently reinterpret or convert a saved date.
            this.triggerEvent("change", { value: "", calendar, leapMonth: false });
        },
        onSolarChange(e) {
            if (!this.data.disabled)
                this.triggerEvent("change", { value: String(e.detail.value), calendar: "solar", leapMonth: false });
        },
        onLunarChange(e) {
            if (this.data.disabled)
                return;
            const [month, day] = e.detail.value.map(Number);
            if (!Number.isInteger(month) || month < 0 || month > 11 || !Number.isInteger(day) || day < 0 || day > 29)
                return;
            const year = /^\d{4}-/.test(this.data.value) ? this.data.value.slice(0, 4) : "0000";
            this.triggerEvent("change", { value: `${year}-${String(month + 1).padStart(2, "0")}-${String(day + 1).padStart(2, "0")}`, calendar: "lunar", leapMonth: this.data.leapMonth });
        },
        onLeapChange(e) {
            if (!this.data.disabled)
                this.triggerEvent("change", { value: this.data.value, calendar: "lunar", leapMonth: e.detail.value });
        }
    }
});
