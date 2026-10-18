"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.publicProductShare = exports.productDiscovery = void 0;
// Public product cards must never inherit family IDs, invitation codes or titles.
exports.productDiscovery = {
    name: "Nestful小窝",
    path: "/pages/about/index",
    title: "Nestful小窝｜家人生日提醒、家庭活动与记账",
    imageUrl: "/assets/share-product.png"
};
const publicProductShare = () => ({
    title: exports.productDiscovery.title,
    path: exports.productDiscovery.path,
    imageUrl: exports.productDiscovery.imageUrl
});
exports.publicProductShare = publicProductShare;
