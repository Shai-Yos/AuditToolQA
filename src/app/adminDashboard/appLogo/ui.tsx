"use client";

import { useState, useRef, useTransition } from "react";
import { uploadAppLogo, removeAppLogo } from "./actions";

export default function AppLogoUI({ currentLogo }: { currentLogo: string | null }) {
  const [preview, setPreview] = useState<string | null>(currentLogo);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, startUpload] = useTransition();
  const [removing, startRemove] = useTransition();
  const [flash, setFlash] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setFlash(null);
  };

  const handleUpload = () => {
    if (!file) return;
    const fd = new FormData();
    fd.append("logo", file);

    startUpload(async () => {
      try {
        const result = await uploadAppLogo(fd);
        setPreview(result.url);
        setFile(null);
        if (inputRef.current) inputRef.current.value = "";
        setFlash({ type: "success", msg: "Logo uploaded successfully." });
      } catch (err: unknown) {
        setFlash({ type: "error", msg: err instanceof Error ? err.message : "Upload failed." });
      }
    });
  };

  const handleRemove = () => {
    startRemove(async () => {
      try {
        await removeAppLogo();
        setPreview(null);
        setFile(null);
        if (inputRef.current) inputRef.current.value = "";
        setFlash({ type: "success", msg: "Logo removed. The default logo will be used." });
      } catch (err: unknown) {
        setFlash({ type: "error", msg: err instanceof Error ? err.message : "Remove failed." });
      }
    });
  };

  return (
    <div className="relative min-h-screen bg-slate-50">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-blue-50 via-cyan-50/40 to-transparent" />
      <div className="relative mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-center text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">App Logo</h1>
      <p className="mt-1 text-center text-sm text-slate-500">
        Upload a custom logo that will appear in the sidebar and mobile header across the app.
      </p>

      {/* Flash */}
      {flash && (
        <div
          className={`mt-4 rounded-lg px-4 py-3 text-sm font-medium ${
            flash.type === "success"
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {flash.msg}
        </div>
      )}

      {/* Current logo preview */}
      <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="mb-3 text-sm font-semibold text-slate-700">Current Logo</p>
        <div className="flex items-center gap-6">
          <div className="flex h-24 w-24 items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50">
            {preview ? (
              <img
                src={preview}
                alt="App logo"
                className="h-20 w-20 object-contain"
              />
            ) : (
              <span className="text-xs text-slate-400">No logo</span>
            )}
          </div>

          <div className="flex flex-col gap-2">
            {/* Sidebar preview */}
            <div className="flex items-center gap-3 rounded-lg bg-slate-900 px-3 py-2">
              <img
                src={preview ?? "/favicon.ico"}
                alt="Sidebar preview"
                className="h-10 w-10 object-contain"
              />
              <span className="text-sm font-semibold text-slate-300">Audit Tool</span>
            </div>
            <p className="text-xs text-slate-400">Sidebar preview</p>
          </div>
        </div>
      </div>

      {/* Upload section */}
      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="mb-3 text-sm font-semibold text-slate-700">Upload New Logo</p>
        <p className="mb-4 text-xs text-slate-500">
          PNG, JPEG, GIF, WebP, SVG or ICO. Max 2 MB. Recommended: square image, at least 128×128px.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml,image/x-icon"
            onChange={handleFileChange}
            className="text-sm text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-blue-700 file:transition hover:file:bg-blue-100"
          />

          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploading ? "Uploading…" : "Upload"}
          </button>

          {currentLogo && (
            <button
              onClick={handleRemove}
              disabled={removing}
              className="rounded-lg border border-red-200 bg-red-50 px-5 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {removing ? "Removing…" : "Remove Logo"}
            </button>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
