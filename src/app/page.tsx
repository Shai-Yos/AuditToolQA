import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/server/db";

export default async function Home() {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  // Check if user still exists in DB
  const user = await db.user.findUnique({
    where: { email: session.user.email! },
  });

  if (!user) {
    // User was removed, redirect to login
    redirect("/login");
  }

  if (session.user.role === "ADMIN") {
    redirect("/adminDashboard");
  } else {
    redirect("/userDashboard");
  }
}