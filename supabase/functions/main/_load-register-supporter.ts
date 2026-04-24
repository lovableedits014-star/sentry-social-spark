import { captureNext } from "./handler-capture.ts";
captureNext("register-supporter");
await import("./register-supporter/index.ts");
