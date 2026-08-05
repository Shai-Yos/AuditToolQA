"use client";

import { useState, useTransition, useEffect, useActionState, useRef } from "react";
import { useRouter } from "next/navigation";
import { getInitials } from "@/components/shell-helpers";
import { addFeedbackComment, deleteFeedback } from "@/app/adminDashboard/feedback/actions";
import { submitFeedback } from "@/app/feedback/actions";

type FeedbackComment = {
  id: string;
  userId: string;
  userName: string;
  image: string | null;
  content: string;
  createdAt: string;
};

type MyFeedbackItem = {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  comments: FeedbackComment[];
};

export function MyFeedbackUI({ feedbacks, currentUserId, currentUserName, currentUserImage }: { feedbacks: MyFeedbackItem[]; currentUserId: string; currentUserName: string; currentUserImage: string | null }) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // New feedback modal state
  const [showNewFeedback, setShowNewFeedback] = useState(false);
  const [fbState, fbAction, fbPending] = useActionState(submitFeedback, { ok: false, error: "" } as { ok: true } | { ok: false; error: string });
  const [rating, setRating] = useState(0);
  const [hoveredStar, setHoveredStar] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const wasPendingRef = useRef(false);

  function handleFbSubmit(formData: FormData) {
    formData.set("rating", String(rating));
    fbAction(formData);
  }

  useEffect(() => {
    if (fbPending) {
      wasPendingRef.current = true;
    } else if (wasPendingRef.current && fbState.ok) {
      wasPendingRef.current = false;
      setSubmitted(true);
      const timer = setTimeout(() => {
        setShowNewFeedback(false);
        setSubmitted(false);
        setRating(0);
        router.refresh();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [fbPending, fbState, router]);

  async function handleDelete(feedbackId: string) {
    setDeletingId(feedbackId);
    await deleteFeedback(feedbackId);
    setDeletingId(null);
  }

  useEffect(() => {
    const es = new EventSource("/api/stream/feedback");
    es.onmessage = () => router.refresh();
    return () => es.close();
  }, [router]);

  return (
    <div className="relative min-h-screen bg-slate-50">
      <div className="absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-blue-50 via-cyan-50/40 to-transparent" />

      {/* New Feedback Modal */}
      {showNewFeedback && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowNewFeedback(false)}>
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800">Share your feedback</h2>
              <button onClick={() => setShowNewFeedback(false)} className="text-gray-400 hover:text-gray-600">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
            {submitted ? (
              <div className="py-8 text-center">
                <p className="text-green-600 font-medium text-lg">Thank you for your feedback!</p>
              </div>
            ) : (
              <form action={handleFbSubmit}>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">How would you rate this tool?</label>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button key={star} type="button" onClick={() => setRating(star)} onMouseEnter={() => setHoveredStar(star)} onMouseLeave={() => setHoveredStar(0)} className="text-3xl transition-colors">
                        <span className={(hoveredStar || rating) >= star ? "text-yellow-400" : "text-gray-300"}>★</span>
                      </button>
                    ))}
                  </div>
                  {rating === 0 && !("ok" in fbState && fbState.ok) && !fbState.ok && fbState.error && (
                    <p className="text-red-500 text-sm mt-1">{fbState.error}</p>
                  )}
                </div>
                <div className="mb-4">
                  <label htmlFor="new-feedback-comment" className="block text-sm font-medium text-gray-700 mb-1">Comments (optional)</label>
                  <textarea id="new-feedback-comment" name="comment" rows={4} maxLength={2000} placeholder="Tell us what you think..." className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-none" />
                </div>
                {!fbState.ok && fbState.error && (
                  <p className="text-red-500 text-sm mb-3">{fbState.error}</p>
                )}
                <button type="submit" disabled={fbPending || rating === 0} className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                  {fbPending ? "Submitting..." : "Submit Feedback"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      <div className="relative mx-auto w-full max-w-none px-4 py-10 sm:px-6 lg:px-8 xl:px-10">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              My Feedback
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Track your submitted feedback and replies
            </p>
          </div>
          <button
            type="button"
            onClick={() => { setShowNewFeedback(true); setSubmitted(false); setRating(0); }}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 active:scale-[0.99] focus:outline-none focus:ring-4 focus:ring-slate-200"
          >
            + New Feedback
          </button>
        </div>

        {feedbacks.length === 0 ? (
          <div className="rounded-xl bg-white border border-slate-200 shadow-sm p-12 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
              <span className="text-2xl">💬</span>
            </div>
            <p className="text-sm font-medium text-slate-900">
              No feedback submitted yet
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Use the feedback button to share your thoughts.
            </p>
          </div>
        ) : (
          <div className="space-y-4 max-h-[calc(100vh-12rem)] overflow-y-auto pr-1">
            {feedbacks.map((f) => (
              <div
                key={f.id}
                className="rounded-xl bg-white border border-slate-200 shadow-sm p-5"
              >
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {currentUserImage ? (
                      <img src={currentUserImage} alt={currentUserName} className="h-8 w-8 rounded-full object-cover ring-2 ring-slate-200" />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-700 text-xs font-bold text-white ring-2 ring-slate-200">
                        {getInitials(currentUserName)}
                      </div>
                    )}
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-slate-700">{currentUserName}</span>
                      <span className="text-xs text-slate-400">
                        {new Date(f.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}{" "}
                        at{" "}
                        {new Date(f.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true })}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex gap-0.5 text-lg">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <span
                          key={star}
                          className={
                            f.rating >= star ? "text-yellow-400" : "text-slate-200"
                          }
                        >
                          ★
                        </span>
                      ))}
                    </div>
                    <button
                      onClick={() => handleDelete(f.id)}
                      disabled={deletingId === f.id}
                      title="Delete feedback"
                      className="ml-1 rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors disabled:opacity-50"
                    >
                      {deletingId === f.id ? (
                        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                      ) : (
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                      )}
                    </button>
                  </div>
                </div>

                {/* Original comment */}
                {f.comment && (
                  <p className="mt-2 border-t border-slate-100 pt-3 text-sm text-slate-700 whitespace-pre-wrap">
                    {f.comment}
                  </p>
                )}

                {/* Replies */}
                {f.comments.length > 0 && (
                  <div className="mt-3 border-t border-slate-100 pt-3 space-y-2">
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                      Replies
                    </p>
                    {f.comments.map((c) => {
                      const isOwn = c.userId === currentUserId;
                      return (
                      <div
                        key={c.id}
                        className={`rounded-lg px-3 py-2 ${
                          isOwn
                            ? "bg-blue-50 border border-blue-100"
                            : "bg-slate-50"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {c.image ? (
                            <img src={c.image} alt="" className="h-6 w-6 rounded-full object-cover ring-1 ring-slate-100" />
                          ) : (
                            <div className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold ring-1 ${isOwn ? "bg-blue-50 text-blue-600 ring-blue-100" : "bg-slate-100 text-slate-600 ring-slate-200"}`}>
                              {getInitials(c.userName)}
                            </div>
                          )}
                          <p className={`text-xs font-medium ${isOwn ? "text-blue-700" : "text-slate-700"}`}>
                            {c.userName}{isOwn && " (You)"}
                          </p>
                          <span className="text-xs text-slate-400">
                            {new Date(c.createdAt).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                            })}{" "}
                            {new Date(c.createdAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                              hour12: true,
                            })}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">
                          {c.content}
                        </p>
                      </div>
                      );
                    })}
                  </div>
                )}

                {/* No replies yet */}
                {f.comments.length === 0 && (
                  <div className="mt-3 border-t border-slate-100 pt-3">
                    <p className="text-xs text-slate-400 italic">
                      No replies yet
                    </p>
                  </div>
                )}

                {/* Reply form */}
                <ReplyForm feedbackId={f.id} currentUserName={currentUserName} currentUserImage={currentUserImage} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ReplyForm({ feedbackId, currentUserName, currentUserImage }: { feedbackId: string; currentUserName: string; currentUserImage: string | null }) {
  const [replyText, setReplyText] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!replyText.trim()) return;
    setError(null);

    startTransition(async () => {
      const result = await addFeedbackComment(feedbackId, replyText);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong");
      } else {
        setReplyText("");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 border-t border-slate-100 pt-3 flex items-center gap-2">
      {currentUserImage ? (
        <img src={currentUserImage} alt={currentUserName} className="h-7 w-7 shrink-0 rounded-full object-cover ring-1 ring-slate-200" />
      ) : (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-700 text-[10px] font-bold text-white ring-1 ring-slate-200">
          {getInitials(currentUserName)}
        </div>
      )}
      <input
        type="text"
        value={replyText}
        onChange={(e) => setReplyText(e.target.value)}
        placeholder="Write a reply..."
        maxLength={2000}
        className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none"
      />
      <button
        type="submit"
        disabled={isPending || !replyText.trim()}
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? "..." : "Reply"}
      </button>
      {error && <p className="text-xs text-red-500 self-center">{error}</p>}
    </form>
  );
}
