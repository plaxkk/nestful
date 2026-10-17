// These remain ordinary pages so shared activity links can keep their query.
export const openFamilyPage = (page: string) => {
  const routes: Record<string, string> = {
    home: "pages/home/index", reminders: "pages/reminders/index", activities: "pages/activities/index",
    records: "pages/digital-space/index", family: "pages/family/index"
  };
  const route = routes[page];
  if (!route) return;
  const url = `/${route}${page === "home" ? "?current=1" : ""}`;
  const pages = getCurrentPages();
  const current = pages[pages.length - 1];
  const isDetail = (p: typeof current) => Boolean(page === "activities" && p.options?.activityId || page === "reminders" && (p.options?.filter || p.options?.create || p.options?.focus));
  if (current?.route === route && !isDetail(current)) return;
  // A focused activity is a detail screen, not the activity list destination.
  const index = pages.findIndex(p => p.route === route && !isDetail(p));
  if (index >= 0 && index < pages.length - 1) {
    wx.navigateBack({ delta: pages.length - 1 - index });
  } else if (pages.length >= 9) {
    wx.redirectTo({ url });
  } else {
    wx.navigateTo({ url });
  }
};
