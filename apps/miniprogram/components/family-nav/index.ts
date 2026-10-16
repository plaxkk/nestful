import { openFamilyPage } from "../../utils/navigation";

Component({
  properties: { active: { type: String, value: "home" }, badge: { type: Number, value: 0 } },
  methods: {
    onNavigate(event: WechatMiniprogram.TouchEvent) {
      openFamilyPage(String(event.currentTarget.dataset.page));
    }
  }
});
