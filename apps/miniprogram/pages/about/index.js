"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const discovery_1 = require("../../utils/discovery");
// This page is identical for visitors and members. Opening it performs no login,
// storage reads or API requests; personal content stays behind the existing APIs.
Page({
    data: { productName: discovery_1.productDiscovery.name },
    onShareAppMessage() { return (0, discovery_1.publicProductShare)(); },
    onShareTimeline() {
        return { title: discovery_1.productDiscovery.title, query: "", imageUrl: discovery_1.productDiscovery.imageUrl };
    }
});
