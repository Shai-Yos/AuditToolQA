"use client";

import { useState, useActionState, useRef, useEffect } from "react";
import { submitFeedback } from "@/app/feedback/actions";

export function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [state, action, isPending] = useActionState(submitFeedback, { ok: false, error: "" } as { ok: true } | { ok: false; error: string });
  const [rating, setRating] = useState(0);
  const [hoveredStar, setHoveredStar] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const wasPendingRef = useRef(false);

  function handleSubmit(formData: FormData) {
    formData.set("rating", String(rating));
    action(formData);
  }

  // Show "Thank you" when submission completes successfully
  useEffect(() => {
    if (isPending) {
      wasPendingRef.current = true;
    } else if (wasPendingRef.current && state.ok) {
      wasPendingRef.current = false;
      setSubmitted(true);
      const timer = setTimeout(() => {
        setOpen(false);
        setSubmitted(false);
        setRating(0);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isPending, state]);

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => { setOpen(true); setSubmitted(false); }}
        className="print:hidden fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 transition-colors"
        title="Send feedback"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
        </svg>
      </button>

      {/* Modal overlay */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 sm:p-6">
          <div className="w-[min(92vw,40rem)] max-h-[90vh] overflow-y-auto rounded-xl bg-white p-[clamp(1rem,1.8vw,1.5rem)] shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[clamp(1rem,1.5vw,1.125rem)] font-semibold text-gray-800">Share your feedback</h2>
              <button
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 sm:h-6 sm:w-6" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>

            {submitted ? (
              <div className="py-8 text-center">
                <p className="text-green-600 font-medium text-lg">Thank you for your feedback!</p>
              </div>
            ) : (
              <form action={handleSubmit}>
                {/* Star rating */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    How would you rate this tool?
                  </label>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setRating(star)}
                        onMouseEnter={() => setHoveredStar(star)}
                        onMouseLeave={() => setHoveredStar(0)}
                        className="text-[clamp(1.5rem,3.2vw,2rem)] transition-colors"
                      >
                        <span className={
                          (hoveredStar || rating) >= star
                            ? "text-yellow-400"
                            : "text-gray-300"
                        }>
                          ★
                        </span>
                      </button>
                    ))}
                  </div>
                  {rating === 0 && !("ok" in state && state.ok) && state.error && (
                    <p className="text-red-500 text-sm mt-1">{state.error}</p>
                  )}
                </div>

                {/* Comment */}
                <div className="mb-4">
                  <label htmlFor="feedback-comment" className="block text-sm font-medium text-gray-700 mb-1">
                    Comments (optional)
                  </label>
                  <textarea
                    id="feedback-comment"
                    name="comment"
                    rows={4}
                    maxLength={2000}
                    placeholder="Tell us what you think..."
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-none"
                  />
                </div>

                {!state.ok && state.error && (
                  <p className="text-red-500 text-sm mb-3">{state.error}</p>
                )}

                <button
                  type="submit"
                  disabled={isPending || rating === 0}
                  className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isPending ? "Submitting..." : "Submit Feedback"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
