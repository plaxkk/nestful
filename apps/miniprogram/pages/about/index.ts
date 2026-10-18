import { productDiscovery, publicProductShare } from "../../utils/discovery";

// This page is identical for visitors and members. Opening it performs no login,
// storage reads or API requests; personal content stays behind the existing APIs.
Page({
  data: { productName: productDiscovery.name },
  onShareAppMessage() { return publicProductShare(); },
  onShareTimeline() {
    return { title: productDiscovery.title, query: "", imageUrl: productDiscovery.imageUrl };
  }
});
