import { appPath } from "../../navigation/routes.js";

export function customPagePath(page) {
  return page.systemRoute ? appPath("lobby").replace(/\/$/, "") + page.systemRoute : appPath("page", page.liveSlug || page.slug);
}
