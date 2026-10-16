"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.openFamilyPage = void 0;
// These remain ordinary pages so shared activity links can keep their query.
const openFamilyPage = (page) => {
    const routes = {
        home: "pages/home/index", activities: "pages/activities/index",
        records: "pages/digital-space/index", family: "pages/family/index"
    };
    const route = routes[page];
    if (!route)
        return;
    const url = `/${route}${page === "home" ? "?current=1" : ""}`;
    const pages = getCurrentPages();
    const current = pages[pages.length - 1];
    if (current?.route === route && !(page === "activities" && current.options?.activityId))
        return;
    // A focused activity is a detail screen, not the activity list destination.
    const index = pages.findIndex(p => p.route === route && !(page === "activities" && p.options?.activityId));
    if (index >= 0 && index < pages.length - 1) {
        wx.navigateBack({ delta: pages.length - 1 - index });
    }
    else if (pages.length >= 9) {
        wx.redirectTo({ url });
    }
    else {
        wx.navigateTo({ url });
    }
};
exports.openFamilyPage = openFamilyPage;
