"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type FileItem = {
  id: string;
  kind: "file" | "folder";
  fileName: string;
  fileUrl: string | null;
  createdAt: string;
};

const PREVIEWABLE_IMAGE = /\.(png|jpe?g|gif|webp|svg)$/i;
const PREVIEWABLE_PDF = /\.pdf$/i;
const OFFICE_FILE = /\.(docx?|xlsx?|pptx?|odt|ods|odp)$/i;

function isPreviewable(name: string): "image" | "pdf" | null {
  if (PREVIEWABLE_IMAGE.test(name)) return "image";
  if (PREVIEWABLE_PDF.test(name)) return "pdf";
  return null;
}

function splitPath(name: string): string[] {
  return name.split("/").filter(Boolean);
}

const API_BASE = "/api/risk-assessments/files";

export default function RiskAssessmentsUI({ isAdmin = false }: { isAdmin?: boolean }) {
  const [items, setItems] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null);

  const refresh = async () => {
    try {
      const res = await fetch(API_BASE, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load");
      const data = (await res.json()) as FileItem[];
      setItems(data);
      setLoadError(null);
    } catch {
      setLoadError("Failed to load risk assessment files");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-blue-50 via-cyan-50/40 to-transparent dark:from-slate-800/40 dark:via-transparent" />

      <div className="relative mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6 flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white text-3xl shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
            ⚠️
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl dark:text-white">
              Annual Internal Audit Risk Assessments
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {isAdmin
                ? "Manage the shared library of annual internal audit risk assessment documents."
                : "Browse and download the latest annual internal audit risk assessment documents."}
            </p>
          </div>
        </div>

        {previewFile && (
          <FilePreviewLightbox
            file={previewFile}
            onClose={() => setPreviewFile(null)}
          />
        )}

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
            Loading…
          </div>
        ) : loadError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm dark:border-red-800 dark:bg-red-900/30 dark:text-red-300">
            {loadError}
          </div>
        ) : (
          <FolderBrowser
            items={items}
            isAdmin={isAdmin}
            onUpdated={refresh}
            onPreview={setPreviewFile}
          />
        )}
      </div>
    </div>
  );
}

// ─── Folder Browser ────────────────────────────────────────────────────────────

function FolderBrowser({
  items,
  isAdmin,
  onUpdated,
  onPreview,
}: {
  items: FileItem[];
  isAdmin: boolean;
  onUpdated: () => void;
  onPreview: (f: FileItem) => void;
}) {
  const [currentPath, setCurrentPath] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [zipping, setZipping] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [openingInOfficeId, setOpeningInOfficeId] = useState<string | null>(null);

  const dragCounter = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const replaceTargetRef = useRef<string | null>(null);
  const newFolderInputRef = useRef<HTMLInputElement>(null);

  const currentPrefix = currentPath.join("/");
  const currentPathStr = currentPrefix ? `${currentPrefix}/` : "";

  // Walk back up if the folder we're in disappears
  useEffect(() => {
    if (currentPath.length === 0) return;
    const stillExists = items.some(
      (f) => f.kind === "folder" && f.fileName === currentPrefix,
    );
    if (!stillExists) setCurrentPath((p) => p.slice(0, -1));
  }, [items, currentPath, currentPrefix]);

  useEffect(() => {
    if (showNewFolderInput) {
      const t = setTimeout(() => newFolderInputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [showNewFolderInput]);

  const { subfolders, currentFiles } = useMemo(() => {
    const folders: FileItem[] = [];
    const fileItems: FileItem[] = [];
    const seenFolderNames = new Set<string>();

    for (const item of items) {
      const segments = splitPath(item.fileName);
      const inHere =
        segments.length === currentPath.length + 1 &&
        currentPath.every((seg, i) => seg === segments[i]);

      if (item.kind === "folder") {
        if (inHere) {
          folders.push(item);
          seenFolderNames.add(segments[segments.length - 1]!);
        }
        continue;
      }

      if (inHere) {
        fileItems.push(item);
        continue;
      }

      // Synthesise an implicit folder for files living deeper than the current
      // path whose parent folder doesn't have a backing row (legacy data).
      const isDescendant =
        segments.length > currentPath.length + 1 &&
        currentPath.every((seg, i) => seg === segments[i]);
      if (isDescendant) {
        const folderName = segments[currentPath.length]!;
        if (!seenFolderNames.has(folderName)) {
          seenFolderNames.add(folderName);
          folders.push({
            id: `__virtual__:${[...currentPath, folderName].join("/")}`,
            kind: "folder",
            fileName: [...currentPath, folderName].join("/"),
            fileUrl: null,
            createdAt: item.createdAt,
          });
        }
      }
    }

    folders.sort((a, b) => a.fileName.localeCompare(b.fileName));
    fileItems.sort((a, b) => a.fileName.localeCompare(b.fileName));
    return { subfolders: folders, currentFiles: fileItems };
  }, [items, currentPath]);

  const totalEntriesHere = subfolders.length + currentFiles.length;

  const hasAnyFileHere = useMemo(() => {
    return items.some((f) => {
      if (f.kind !== "file") return false;
      if (!currentPrefix) return true;
      return f.fileName.startsWith(`${currentPrefix}/`);
    });
  }, [items, currentPrefix]);

  // ── API helpers ───────────────────────────────────────────────────────────
  const uploadFileApi = async (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("relativePath", `${currentPathStr}${file.name}`);
    const res = await fetch(API_BASE, { method: "POST", body: fd });
    if (!res.ok) throw new Error("Upload failed");
  };

  const createFolderApi = async (name: string) => {
    const fd = new FormData();
    fd.append("kind", "folder");
    fd.append("path", `${currentPathStr}${name}`);
    const res = await fetch(API_BASE, { method: "POST", body: fd });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(data?.error ?? "Failed to create folder");
    }
  };

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    if (selected.length === 0) return;
    setUploading(true);
    let failed = 0;
    try {
      for (const file of selected) {
        try {
          await uploadFileApi(file);
        } catch {
          failed += 1;
        }
      }
      onUpdated();
      if (failed > 0) alert(`${failed} file(s) failed to upload.`);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) {
      setShowNewFolderInput(false);
      return;
    }
    setCreatingFolder(true);
    try {
      await createFolderApi(name);
      setNewFolderName("");
      setShowNewFolderInput(false);
      onUpdated();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create folder");
    } finally {
      setCreatingFolder(false);
    }
  };

  const handleReplaceClick = (fileId: string) => {
    replaceTargetRef.current = fileId;
    replaceInputRef.current?.click();
  };

  const handleReplaceChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const targetId = replaceTargetRef.current;
    if (!file || !targetId) {
      if (replaceInputRef.current) replaceInputRef.current.value = "";
      return;
    }
    setReplacingId(targetId);
    try {
      await uploadFileApi(file);
      await fetch(`${API_BASE}?fileId=${targetId}`, { method: "DELETE" });
      onUpdated();
    } catch {
      alert("Failed to replace file.");
    } finally {
      setReplacingId(null);
      replaceTargetRef.current = null;
      if (replaceInputRef.current) replaceInputRef.current.value = "";
    }
  };

  const handleDelete = async (id: string, displayName: string, isFolder: boolean) => {
    if (id.startsWith("__virtual__:")) {
      alert("This folder is empty in the database. Delete the files it contains.");
      return;
    }
    const msg = isFolder
      ? `Delete folder "${displayName}" and everything inside it? This action cannot be undone.`
      : `Are you sure you want to delete "${displayName}"? This action cannot be undone.`;
    if (!confirm(msg)) return;
    setDeletingId(id);
    try {
      const res = await fetch(`${API_BASE}?fileId=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      onUpdated();
    } catch {
      alert("Failed to delete.");
    } finally {
      setDeletingId(null);
    }
  };

  // ── Drag & drop (admin only) ──────────────────────────────────────────────
  const handleDragEnter = (e: React.DragEvent) => {
    if (!isAdmin) return;
    e.preventDefault();
    dragCounter.current += 1;
    if (e.dataTransfer.types.includes("Files")) setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    if (!isAdmin) return;
    e.preventDefault();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDragging(false);
    }
  };
  const handleDragOver = (e: React.DragEvent) => {
    if (!isAdmin) return;
    e.preventDefault();
  };
  const handleDrop = async (e: React.DragEvent) => {
    if (!isAdmin) return;
    e.preventDefault();
    dragCounter.current = 0;
    setIsDragging(false);

    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length === 0) return;

    setUploading(true);
    let failed = 0;
    try {
      for (const file of dropped) {
        try {
          await uploadFileApi(file);
        } catch {
          failed += 1;
        }
      }
      onUpdated();
      if (failed > 0) alert(`${failed} file(s) failed to upload.`);
    } finally {
      setUploading(false);
    }
  };

  // ── Open in Office Online ────────────────────────────────────────────────
  const handleOpenInOffice = async (fileId: string) => {
    setOpeningInOfficeId(fileId);
    try {
      const res = await fetch(`/api/onedrive/open-url?fileId=${fileId}&type=risk-assessment`);
      const data = (await res.json()) as { webUrl?: string; error?: string };
      if (!res.ok || !data.webUrl) {
        alert(data.error ?? "Could not get Office Online URL.");
        return;
      }
      window.open(data.webUrl, "_blank", "noopener,noreferrer");
    } catch {
      alert("Failed to open in Office Online.");
    } finally {
      setOpeningInOfficeId(null);
    }
  };

  // ── Download all as zip ───────────────────────────────────────────────────
  const handleDownloadAll = async () => {
    setZipping(true);
    try {
      const qs = new URLSearchParams();
      if (currentPrefix) qs.set("path", currentPrefix);
      const url = qs.toString()
        ? `${API_BASE}/download-zip?${qs.toString()}`
        : `${API_BASE}/download-zip`;
      const res = await fetch(url);
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        alert(data?.error ?? "Failed to build zip");
        return;
      }

      const disp = res.headers.get("Content-Disposition") ?? "";
      const match = /filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i.exec(disp);
      const filename =
        (match?.[1] && decodeURIComponent(match[1])) ||
        `${currentPath[currentPath.length - 1] ?? "Annual Internal Audit Risk Assessments"}.zip`;

      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      alert("Failed to download zip");
    } finally {
      setZipping(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={[
        "relative rounded-2xl border bg-white shadow-sm transition dark:bg-slate-800",
        isDragging
          ? "border-blue-400 ring-2 ring-blue-200 dark:border-blue-500 dark:ring-blue-800"
          : "border-slate-200 dark:border-slate-700",
      ].join(" ")}
    >
      {isDragging && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-blue-50/90 backdrop-blur-sm dark:bg-blue-900/40">
          <p className="text-sm font-semibold text-blue-700 dark:text-blue-200">
            📥 Drop files to upload
          </p>
        </div>
      )}

      {/* Header / breadcrumb */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-700">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-lg ring-1 ring-slate-200 dark:bg-slate-700 dark:ring-slate-600">
            📁
          </div>
          <div className="flex min-w-0 items-center gap-1 text-sm">
            <button
              type="button"
              onClick={() => setCurrentPath([])}
              className={`font-semibold transition ${
                currentPath.length === 0
                  ? "text-slate-900 dark:text-white"
                  : "text-blue-600 hover:underline dark:text-blue-400"
              }`}
            >
              Annual Internal Audit Risk Assessments
            </button>
            {currentPath.map((seg, i) => (
              <span key={i} className="flex min-w-0 items-center gap-1">
                <span className="text-slate-300 dark:text-slate-600">/</span>
                <button
                  type="button"
                  onClick={() => setCurrentPath(currentPath.slice(0, i + 1))}
                  className={`truncate font-semibold transition ${
                    i === currentPath.length - 1
                      ? "text-slate-900 dark:text-white"
                      : "text-blue-600 hover:underline dark:text-blue-400"
                  }`}
                  title={seg}
                >
                  {seg}
                </button>
              </span>
            ))}
          </div>
          {totalEntriesHere > 0 && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-400">
              {totalEntriesHere}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {hasAnyFileHere && (
            <button
              type="button"
              onClick={handleDownloadAll}
              disabled={zipping}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
              title="Download all files in this folder as a zip"
            >
              {zipping ? "📦 Zipping…" : "📥 Download all (.zip)"}
            </button>
          )}
          {isAdmin && (
            <>
              <input
                ref={inputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleUpload}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.png,.jpg,.jpeg"
              />
              <input
                ref={replaceInputRef}
                type="file"
                className="hidden"
                onChange={handleReplaceChange}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.png,.jpg,.jpeg"
              />
              <button
                type="button"
                onClick={() => setShowNewFolderInput(true)}
                disabled={creatingFolder || showNewFolderInput}
                className="inline-flex items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 transition hover:border-violet-300 hover:bg-violet-100 disabled:opacity-50 dark:border-violet-800 dark:bg-violet-900/30 dark:text-violet-400"
              >
                📁 New Folder
              </button>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={uploading}
                className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition disabled:opacity-50 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
              >
                {uploading ? "Uploading…" : "📤 Add File"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* New folder inline input */}
      {showNewFolderInput && (
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3 dark:border-slate-700">
          <span className="text-base">📁</span>
          <input
            ref={newFolderInputRef}
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleCreateFolder();
              if (e.key === "Escape") {
                setShowNewFolderInput(false);
                setNewFolderName("");
              }
            }}
            placeholder="Folder name"
            disabled={creatingFolder}
            className="flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-sm text-slate-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-200 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
          />
          <button
            type="button"
            onClick={handleCreateFolder}
            disabled={creatingFolder || !newFolderName.trim()}
            className="inline-flex items-center gap-1 rounded-lg bg-violet-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-violet-700 disabled:opacity-50"
          >
            {creatingFolder ? "Creating…" : "Create"}
          </button>
          <button
            type="button"
            onClick={() => {
              setShowNewFolderInput(false);
              setNewFolderName("");
            }}
            disabled={creatingFolder}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Listing */}
      {totalEntriesHere === 0 && !showNewFolderInput ? (
        <p className="px-5 py-6 text-center text-xs text-slate-400 dark:text-slate-500">
          {isAdmin
            ? "This folder is empty - drop files here, click Add File, or create a new folder."
            : "There are no documents in this folder yet."}
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-700">
          {subfolders.map((folder) => {
            const segs = splitPath(folder.fileName);
            const name = segs[segs.length - 1]!;
            const isVirtual = folder.id.startsWith("__virtual__:");
            return (
              <li key={folder.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <button
                  type="button"
                  onClick={() => setCurrentPath([...currentPath, name])}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <span className="text-base">📂</span>
                  <span
                    className="truncate text-xs font-semibold text-slate-900 hover:text-violet-700 dark:text-white"
                    title={name}
                  >
                    {name}
                  </span>
                </button>
                {isAdmin && !isVirtual && (
                  <button
                    type="button"
                    onClick={() => handleDelete(folder.id, name, true)}
                    disabled={deletingId === folder.id}
                    className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 transition disabled:opacity-50 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400"
                  >
                    🗑️ {deletingId === folder.id ? "Deleting…" : "Delete"}
                  </button>
                )}
              </li>
            );
          })}

          {currentFiles.map((f) => {
            const segs = splitPath(f.fileName);
            const leafName = segs[segs.length - 1]!;
            const previewKind = isPreviewable(leafName);
            const url = f.fileUrl ?? "#";
            return (
              <li key={f.id} className="flex flex-col gap-2 px-5 py-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="text-base">📄</span>
                  {previewKind ? (
                    <button
                      type="button"
                      onClick={() => onPreview(f)}
                      className="block min-w-0 flex-1 truncate text-left text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                      title={`Preview ${leafName}`}
                    >
                      {leafName}
                    </button>
                  ) : (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block min-w-0 flex-1 truncate text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                      title={leafName}
                    >
                      {leafName}
                    </a>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
                  >
                    📥 Download
                  </a>
                  {OFFICE_FILE.test(leafName) && (
                    <button
                      type="button"
                      onClick={() => void handleOpenInOffice(f.id)}
                      disabled={openingInOfficeId === f.id}
                      className="inline-flex items-center gap-1 rounded-lg border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700 transition disabled:opacity-50 dark:border-green-800 dark:bg-green-900/30 dark:text-green-400"
                      title="Edit this file in Office Online (browser)"
                    >
                      {openingInOfficeId === f.id ? "Opening…" : "✏️ Edit Online"}
                    </button>
                  )}
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => handleReplaceClick(f.id)}
                      disabled={replacingId === f.id}
                      className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 transition disabled:opacity-50 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                    >
                      {replacingId === f.id ? "Replacing…" : "🔄 Replace"}
                    </button>
                  )}
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => handleDelete(f.id, leafName, false)}
                      disabled={deletingId === f.id}
                      className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 transition disabled:opacity-50 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400"
                    >
                      🗑️ {deletingId === f.id ? "Deleting…" : "Delete"}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ─── File Preview Lightbox ─────────────────────────────────────────────────────

function FilePreviewLightbox({
  file,
  onClose,
}: {
  file: FileItem;
  onClose: () => void;
}) {
  const kind = isPreviewable(file.fileName);
  const url = file.fileUrl ?? "";
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex h-full max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3 dark:border-slate-700">
          <p
            className="truncate text-sm font-semibold text-slate-900 dark:text-white"
            title={file.fileName}
          >
            📄 {file.fileName}
          </p>
          <div className="flex items-center gap-2">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              download
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
            >
              📥 Download
            </a>
            <button
              type="button"
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700"
              title="Close (Esc)"
            >
              ✕
            </button>
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center overflow-auto bg-slate-100 dark:bg-slate-900">
          {kind === "image" && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={file.fileName}
              className="max-h-full max-w-full object-contain"
            />
          )}
          {kind === "pdf" && (
            <iframe src={url} className="h-full w-full" title={file.fileName} />
          )}
          {!kind && (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Preview not available for this file type.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
