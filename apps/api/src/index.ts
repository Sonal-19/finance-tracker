import cors from "@elysiajs/cors";
import Elysia from "elysia";
import { mainController } from "./controllers";
import { connectionTest } from "./db/connect";
import { ALLOWED_ORIGIN_HOSTS, IS_PROD, PORT } from "./env";
import { coreAuthService } from "./lib/services/core-auth-service";
import { recurringService } from "./lib/services/recurring-service";

const app = new Elysia({ name: "main_app" })
  .use(
    cors({
      origin: IS_PROD ? ALLOWED_ORIGIN_HOSTS : true,
      credentials: true,
    }),
  )
  .onRequest(({ set }) => {
    set.headers["X-Content-Type-Options"] = "nosniff";
    set.headers["X-Frame-Options"] = "DENY";
    set.headers["Referrer-Policy"] = "same-origin";
  })
  .use(mainController)
  .get("/health", () => ({
    status: "ok",
    timestamp: new Date().toISOString(),
  }));

export type Server = typeof app;

connectionTest().then(async (res) => {
  if (res) {
    await coreAuthService.initialize();
    recurringService.startSchedule();
    app.listen(PORT);
    console.info(`ENV is ${process.env.NODE_ENV}`);
    console.info(
      `🦊 Finance API running at ${app.server?.hostname}:${app.server?.port}`,
    );
  } else {
    console.error(
      "Fatal Error: Database connection failed, everything is down",
    );
    new Elysia({ name: "fatal_service_reporter" })
      .all("*", ({ set }) => {
        set.status = 500;
        return {
          success: false,
          message: "Database connection has failed, everything is down",
          data: null,
        };
      })
      .listen(PORT);
  }
});
