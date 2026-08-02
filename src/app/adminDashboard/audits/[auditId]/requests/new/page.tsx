import { db } from "~/server/db";
import { notFound } from "next/navigation";
import CreateRequestUI from "./ui";

export default async function Page({ 
  params,
  searchParams 
}: { 
  params: Promise<{ auditId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { auditId } = await params;
  const { tab } = await searchParams;
  const audit = await db.audit.findUnique({
    where: { id: auditId },
    select: {
      id: true,
      title: true,
      frontRoomsCount: true,
      requestStatuses: { orderBy: { order: "asc" }, select: { id: true, name: true, order: true } },
    },
  });

  if (!audit) return notFound();

  return (
    <CreateRequestUI
      auditId={audit.id}
      auditTitle={audit.title}
      defaultStatusColumnId={audit.requestStatuses[0]?.id ?? null}
      returnTab={tab || "requests"}
      frontRoomsCount={audit.frontRoomsCount}
    />
  );
}