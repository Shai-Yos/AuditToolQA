import { requireUser } from "@/server/helpers/currentUser";
import ProfileUI from "@/components/profile-ui";

export default async function UserSettingsPage() {
  const user = await requireUser();

  return (
    <ProfileUI
      user={{
        name: user.name ?? "",
        email: user.email ?? "",
        role: user.role,
        image: user.image ?? null,
        memberSince: user.createdAt?.toISOString() ?? new Date().toISOString(),
      }}
    />
  );
}
