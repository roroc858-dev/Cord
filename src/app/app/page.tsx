import { redirect } from "next/navigation";
import { Workspace } from "@/components/workspace";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AppPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <Workspace
      user={{
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        email: user.email,
        presence: user.presence,
      }}
    />
  );
}
