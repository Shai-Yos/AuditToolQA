"use client";

import { useState } from "react";

export type ExportType = "excel" | "zip";

interface ExportModalProps {
  auditTitle: string;
  onConfirm: (type: ExportType) => void;
  onClose: () => void;
}

export default function ExportModal({ auditTitle, onConfirm, onClose }: ExportModalProps) {
  const [selected, setSelected] = useState<ExportType>("excel");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-md flex-col gap-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Export Audit
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700"
          >
            ✕
          </button>
        </div>

        <p className="text-sm text-slate-500 dark:text-slate-400">
          Choose the export format for{" "}
          <span className="font-semibold text-slate-700 dark:text-slate-300">{auditTitle}</span>.
        </p>

        {/* Options */}
        <div className="flex flex-col gap-3">
          <label
            className={[
              "flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition",
              selected === "excel"
                ? "border-blue-400 bg-blue-50 ring-1 ring-blue-300 dark:border-blue-600 dark:bg-blue-900/30 dark:ring-blue-700"
                : "border-slate-200 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-700/40",
            ].join(" ")}
          >
            <input
              type="radio"
              name="exportType"
              value="excel"
              checked={selected === "excel"}
              onChange={() => setSelected("excel")}
              className="mt-0.5 accent-blue-600"
            />
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                📊 Excel only
              </p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Single .xlsx file with all audit data, requests, comments, documents list, and transcriptions.
              </p>
            </div>
          </label>

          <label
            className={[
              "flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition",
              selected === "zip"
                ? "border-blue-400 bg-blue-50 ring-1 ring-blue-300 dark:border-blue-600 dark:bg-blue-900/30 dark:ring-blue-700"
                : "border-slate-200 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-700/40",
            ].join(" ")}
          >
            <input
              type="radio"
              name="exportType"
              value="zip"
              checked={selected === "zip"}
              onChange={() => setSelected("zip")}
              className="mt-0.5 accent-blue-600"
            />
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                📦 ZIP with all attachments
              </p>
              <ul className="mt-1.5 space-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                <li className="flex items-center gap-1.5">
                  <span className="text-slate-400">•</span>
                  <span>
                    <strong className="text-slate-600 dark:text-slate-300">Excel export</strong> (.xlsx)
                  </span>
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="text-slate-400">•</span>
                  <span>
                    <strong className="text-slate-600 dark:text-slate-300">requests/</strong> - requests files
                  </span>
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="text-slate-400">•</span>
                  <span>
                    <strong className="text-slate-600 dark:text-slate-300">chats/</strong> - chats files
                  </span>
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="text-slate-400">•</span>
                  <span>
                    <strong className="text-slate-600 dark:text-slate-300">Audit Agenda/</strong> - agenda files
                  </span>
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="text-slate-400">•</span>
                  <span>
                    <strong className="text-slate-600 dark:text-slate-300">Ready Box/</strong> - ready box files
                  </span>
                </li>
              </ul>
            </div>
          </label>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-700">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(selected)}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
          >
            Export
          </button>
        </div>
      </div>
    </div>
  );
}
