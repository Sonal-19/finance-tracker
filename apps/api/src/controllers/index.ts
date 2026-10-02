import Elysia from "elysia";
import { accountControllers } from "./accounts-controller";
import { authController } from "./auth-controller";
import { budgetsController } from "./budgets-controller";
import { categoriesController } from "./categories-controller";
import { eventsController } from "./events-controller";
import { fxController } from "./fx-controller";
import { goalsController } from "./goals-controller";
import { passkeysController } from "./passkeys-controller";
import { profileController } from "./profile-controller";
import { recurringController } from "./recurring-controller";
import { reportsController } from "./reports-controller";
import { splitControllers } from "./splits-controller";
import { systemConfigController } from "./system-config-controller";
import { transactionsController } from "./transactions-controller";

/** Logged-in routes. Grouped so protectedUser's scoped hooks stop here
 * and never leak onto the public auth routes. */
const userControllers = new Elysia({ name: "user_controllers" })
  .use(profileController)
  .use(passkeysController)
  .use(categoriesController)
  .use(transactionsController)
  .use(reportsController)
  .use(budgetsController)
  .use(recurringController)
  .use(goalsController)
  .use(fxController)
  .use(splitControllers)
  .use(accountControllers)
  .use(eventsController);

/** Admin-only routes, grouped for the same reason as above. */
const adminControllers = new Elysia({ name: "admin_controllers" }).use(
  systemConfigController,
);

export const mainController = new Elysia({
  name: "router",
  prefix: "/api",
})
  .use(authController)
  .use(userControllers)
  .use(adminControllers);
