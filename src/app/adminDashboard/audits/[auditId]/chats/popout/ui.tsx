"use client";

import { useEffect, useState } from "react";
import { ChatPanel } from "../ui";
import { NewRequestModal } from "@/components/new-request-modal";

type Message = {
  id: string;
  authorName: string;
  authorImage?: string | null;
  authorRole?: string;
  time: string;
  text: string;
  fileUrl?: string | null;
  fileName?: string | null;
  fileMime?: string | null;
  fileSize?: number | null;
  editedAt?: string | null;
};

export default function PopoutUI({
  auditId,
  auditTitle,
  channel,
  title,
  badge,
  initialMessages,
  composerPlaceholder,
  currentUserName,
  rightPanel,
  frIndex,
}: {
  auditId: string;
  auditTitle: string;
  channel: string;
  title: string;
  badge: string;
  initialMessages: Message[];
  composerPlaceholder: string;
  currentUserName: string;
  rightPanel?: boolean;
  frIndex?: number;
}) {
  const [showModal, setShowModal] = useState(false);
  const [prefillTitle, setPrefillTitle] = useState<string | undefined>();
  const [prefillFrIndex, setPrefillFrIndex] = useState<number | undefined>();

  useEffect(() => {
    document.title = `${title} — ${auditTitle}`;
  }, [title, auditTitle]);

  return (
    <div className="flex h-screen min-h-0 flex-col bg-white">
      {/* Audit title bar */}
      <div className="shrink-0 border-b border-slate-200 bg-slate-50 px-6 py-4">
        <h1 className="truncate text-lg font-bold text-slate-800">{auditTitle}</h1>
      </div>
      <ChatPanel
        auditId={auditId}
        channel={channel}
        title={title}
        badge={badge}
        initialMessages={initialMessages}
        composerPlaceholder={composerPlaceholder}
        currentUserName={currentUserName}
        rightPanel={rightPanel}
        frIndex={frIndex}
        popout
        onCreateRequest={(text, frIdx) => {
          setPrefillTitle(text);
          setPrefillFrIndex(frIdx ?? undefined);
          setShowModal(true);
        }}
      />
      {showModal && (
        <NewRequestModal
          auditId={auditId}
          auditTitle={title}
          frontRoomsCount={frIndex ?? 1}
          prefillTitle={prefillTitle}
          prefillFrIndex={prefillFrIndex}
          onClose={() => { setShowModal(false); setPrefillTitle(undefined); setPrefillFrIndex(undefined); }}
        />
      )}
    </div>
  );
}
