// Public product cards must never inherit family IDs, invitation codes or titles.
export const productDiscovery = {
  name: "Nestful小窝",
  path: "/pages/about/index",
  title: "Nestful小窝｜家人生日提醒、家庭活动与记账",
  imageUrl: "/assets/share-product.png"
};

export const publicProductShare = () => ({
  title: productDiscovery.title,
  path: productDiscovery.path,
  imageUrl: productDiscovery.imageUrl
});
