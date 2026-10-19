export type BirthdayCalendar = "solar" | "lunar";
export type BirthdayChangeDetail = { value: string; calendar: BirthdayCalendar; leapMonth: boolean };

export const lunarMonths = ["正月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "冬月", "腊月"];
export const lunarDays = ["初一", "初二", "初三", "初四", "初五", "初六", "初七", "初八", "初九", "初十", "十一", "十二", "十三", "十四", "十五", "十六", "十七", "十八", "十九", "二十", "廿一", "廿二", "廿三", "廿四", "廿五", "廿六", "廿七", "廿八", "廿九", "三十"];

export const validBirthday = (value: string, calendar: BirthdayCalendar) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > (calendar === "lunar" ? 30 : 31)) return false;
  if (calendar === "lunar") return true;
  const d = new Date(Date.UTC(year || 2000, month - 1, day));
  return d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
};

export const birthdayLabel = (value: string, calendar: BirthdayCalendar, leapMonth = false) => {
  if (!validBirthday(value, calendar)) return "";
  const [year, month, day] = value.split("-").map(Number);
  return calendar === "lunar"
    ? `农历${leapMonth ? "闰" : ""}${lunarMonths[month - 1]}${lunarDays[day - 1]}`
    : `公历${year ? `${year}年` : ""}${month}月${day}日`;
};
