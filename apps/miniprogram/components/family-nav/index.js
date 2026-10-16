"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const navigation_1 = require("../../utils/navigation");
Component({
    properties: { active: { type: String, value: "home" }, badge: { type: Number, value: 0 } },
    methods: {
        onNavigate(event) {
            (0, navigation_1.openFamilyPage)(String(event.currentTarget.dataset.page));
        }
    }
});
