import fs from "node:fs";
import type { ConfigContext, ExpoConfig } from "expo/config";

// app.json giữ cấu hình tĩnh (eas init sẽ ghi projectId vào đó); file này bổ sung plugin & biến môi trường lúc build.
export default ({ config }: ConfigContext): ExpoConfig => {
  const hasFcm = fs.existsSync("./google-services.json");
  return {
    ...(config as ExpoConfig),
    name: config.name ?? "FixGo",
    slug: config.slug ?? "fixgo-user",
    android: {
      ...config.android,
      ...(hasFcm ? { googleServicesFile: "./google-services.json" } : {}),
    },
    plugins: [
      "expo-web-browser",
      "expo-router",
      "expo-dev-client",
      // Secret token (sk.…, scope DOWNLOADS:READ) chỉ cần lúc build native trên EAS Cloud
      [
        "@rnmapbox/maps",
        { RNMapboxMapsDownloadToken: process.env.RNMAPBOX_MAPS_DOWNLOAD_TOKEN },
      ],
      [
        "expo-location",
        {
          locationWhenInUsePermission:
            "FixGo cần vị trí của bạn để gọi thợ cứu hộ đến đúng nơi.",
        },
      ],
      [
        "expo-image-picker",
        {
          photosPermission: "FixGo cần truy cập ảnh để đính kèm hình sự cố.",
          cameraPermission: "FixGo cần dùng camera để chụp hình sự cố.",
        },
      ],
      ["expo-notifications", { color: "#00B14F" }],
    ],
  };
};
