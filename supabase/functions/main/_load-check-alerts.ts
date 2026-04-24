import { captureNext } from "./handler-capture.ts";
captureNext("check-alerts");
await import("./check-alerts/index.ts");
