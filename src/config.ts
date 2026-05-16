import { createMeshConfig } from "@baditaflorin/mesh-common";

export const config = createMeshConfig({
  appName: "mesh-treasure-hunt",
  description: "Ordered QR treasure hunt — print N posters, scan them in order to win",
  accentHex: "#06b6d4",
  version: __APP_VERSION__,
  commit: __GIT_COMMIT__,
});
