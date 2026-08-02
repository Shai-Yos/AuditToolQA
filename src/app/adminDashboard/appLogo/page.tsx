import { requireAdmin } from "~/server/helpers/currentUser";
import { db } from "~/server/db";
import AppLogoUI from "./ui";

export default async function Page() {
  await requireAdmin();

  const config = await db.appConfig.findUnique({ where: { key: "appLogo" } });
  const currentLogo = config?.value ?? null;

  return <AppLogoUI currentLogo={currentLogo} />;
}
