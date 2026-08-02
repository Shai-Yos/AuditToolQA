"use client";
// test: github actions trigger
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useAuditNav } from "@/components/audit-nav-context";
import { deleteAudit } from "@/app/adminDashboard/actions";
import ExportModal, { type ExportType } from "./_components/ExportModal";

type Slot = "agenda" | "readyBox";

const SLOT_LABELS: Record<Slot, string> = {
  agenda: "General",
  readyBox: "Ready Box",
};

type AuditFileItem = {
  id: string;
  kind: "file" | "folder";
  fileName: string;
  fileUrl: string | null;
  createdAt: string;
};

type ActivityItem = {
  id: string;
  action: string;
  actorName: string;
  targetTitle: string;
  createdAt: string;
  meta: string | null;
};

type StatusBucket = { name: string; count: number; color: string; order: number };

// ─── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function formatDuration(ms: number): string {
  if (ms < 0 || Number.isNaN(ms)) return "—";
  if (ms < 60_000) return "< 1m";

  const totalMins = Math.floor(ms / 60_000);
  if (totalMins < 60) return `${totalMins}m`;

  const totalHours = Math.floor(totalMins / 60);
  if (totalHours < 24) {
    const m = totalMins % 60;
    return m ? `${totalHours}h ${m}m` : `${totalHours}h`;
  }

  const totalDays = Math.floor(totalHours / 24);
  if (totalDays < 30) {
    const h = totalHours % 24;
    return h ? `${totalDays}d ${h}h` : `${totalDays}d`;
  }

  const totalMonths = Math.floor(totalDays / 30);
  if (totalMonths < 12) {
    const d = totalDays % 30;
    return d ? `${totalMonths}mo ${d}d` : `${totalMonths}mo`;
  }

  const years = Math.floor(totalMonths / 12);
  const mo = totalMonths % 12;
  return mo ? `${years}y ${mo}mo` : `${years}y`;
}

const PREVIEWABLE_IMAGE = /\.(png|jpe?g|gif|webp|svg)$/i;
const PREVIEWABLE_PDF = /\.pdf$/i;
const OFFICE_FILE = /\.(docx?|xlsx?|pptx?)$/i;

function isPreviewable(name: string): "image" | "pdf" | null {
  if (PREVIEWABLE_IMAGE.test(name)) return "image";
  if (PREVIEWABLE_PDF.test(name)) return "pdf";
  return null;
}

const ACTIVITY_ICON: Record<string, { icon: string; color: string }> = {
  AUDIT_CREATED: { icon: "✨", color: "text-green-600" },
  AUDIT_UPDATED: { icon: "✏️", color: "text-blue-600" },
  REQUEST_CREATED: { icon: "📝", color: "text-blue-600" },
  REQUEST_UPDATED: { icon: "✏️", color: "text-blue-600" },
  REQUEST_MOVED: { icon: "➡️", color: "text-violet-600" },
  REQUEST_CANCELLED: { icon: "🚫", color: "text-amber-600" },
  REQUEST_DELETED: { icon: "🗑️", color: "text-red-600" },
  USER_ASSIGNED_REQUEST: { icon: "👤", color: "text-emerald-600" },
  USER_UNASSIGNED_REQUEST: { icon: "👤", color: "text-slate-500" },
  USER_ASSIGNED_AUDIT: { icon: "👥", color: "text-emerald-600" },
  USER_UNASSIGNED_AUDIT: { icon: "👥", color: "text-slate-500" },
  USER_ROLE_UPDATED_AUDIT: { icon: "🔁", color: "text-violet-600" },
};

function activityVerb(action: string): string {
  switch (action) {
    case "AUDIT_CREATED": return "created the audit";
    case "AUDIT_UPDATED": return "updated the audit";
    case "REQUEST_CREATED": return "created request";
    case "REQUEST_UPDATED": return "updated request";
    case "REQUEST_MOVED": return "moved request";
    case "REQUEST_CANCELLED": return "cancelled request";
    case "REQUEST_DELETED": return "deleted request";
    case "USER_ASSIGNED_REQUEST": return "assigned users to request";
    case "USER_UNASSIGNED_REQUEST": return "removed users from request";
    case "USER_ASSIGNED_AUDIT": return "assigned users to the audit";
    case "USER_UNASSIGNED_AUDIT": return "removed users from the audit";
    case "USER_ROLE_UPDATED_AUDIT": return "updated audit roles";
    default: return action.replace(/_/g, " ").toLowerCase();
  }
}

// ─── File Preview Lightbox ─────────────────────────────────────────────────────

function FilePreviewLightbox({
  file,
  onClose,
}: {
  file: AuditFileItem;
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative flex h-full max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3 dark:border-slate-700">
          <p className="truncate text-sm font-semibold text-slate-900 dark:text-white" title={file.fileName}>
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
            <img src={url} alt={file.fileName} className="max-h-full max-w-full object-contain" />
          )}
          {kind === "pdf" && (
            <iframe src={url} className="h-full w-full" title={file.fileName} />
          )}
          {!kind && (
            <p className="text-sm text-slate-500 dark:text-slate-400">Preview not available for this file type.</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── File Slot ─────────────────────────────────────────────────────────────────

/**
 * Files and folders are stored as a flat list. Each row carries a `fileName`
 * which encodes its path within the slot, e.g. "Reports/2026/Q1.pdf".
 *
 * The FileSlot UI lets the user create subfolders, navigate into them, and
 * upload files into the current folder. Folders are persisted as their own
 * `AuditFile` rows so empty folders survive page refreshes.
 */

function splitPath(name: string): string[] {
  return name.split("/").filter(Boolean);
}

function FileSlot({
  slot,
  auditId,
  files,
  isAdmin,
  onUpdated,
  onPreview,
  defaultFolders,
}: {
  slot: Slot;
  auditId: string;
  files: AuditFileItem[];
  isAdmin: boolean;
  onUpdated: () => void;
  onPreview: (file: AuditFileItem) => void;
  /** Folder paths (as segment arrays) to auto-create on first mount if missing. */
  defaultFolders?: string[][];
}) {
  const [currentPath, setCurrentPath] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [openingInOfficeId, setOpeningInOfficeId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);

  const dragCounter = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const replaceTargetRef = useRef<string | null>(null);
  const newFolderInputRef = useRef<HTMLInputElement>(null);
  const defaultFoldersCreatedRef = useRef(false);

  const currentPrefix = currentPath.join("/"); // "" at root
  const currentPathStr = currentPrefix ? `${currentPrefix}/` : "";

  // Auto-create default folder structure on first mount (admin only)
  useEffect(() => {
    if (!isAdmin || !defaultFolders?.length || defaultFoldersCreatedRef.current) return;
    defaultFoldersCreatedRef.current = true;

    void (async () => {
      let anyCreated = false;
      for (const folderPath of defaultFolders) {
        const pathStr = folderPath.join("/");
        const exists = files.some((f) => f.kind === "folder" && f.fileName === pathStr);
        if (!exists) {
          const parentPath = folderPath.slice(0, -1).join("/");
          const prefix = parentPath ? `${parentPath}/` : "";
          const name = folderPath[folderPath.length - 1]!;
          const fd = new FormData();
          fd.append("slot", slot);
          fd.append("kind", "folder");
          fd.append("path", `${prefix}${name}`);
          try {
            const res = await fetch(`/api/audits/${auditId}/files`, { method: "POST", body: fd });
            if (res.ok) anyCreated = true;
          } catch {
            // non-critical, ignore
          }
        }
      }
      if (anyCreated) onUpdated();
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If the current folder gets deleted externally, walk back up
  useEffect(() => {
    if (currentPath.length === 0) return;
    const stillExists = files.some(
      (f) => f.kind === "folder" && f.fileName === currentPrefix,
    );
    if (!stillExists) setCurrentPath((p) => p.slice(0, -1));
  }, [files, currentPath, currentPrefix]);

  useEffect(() => {
    if (showNewFolderInput) {
      // focus shortly after the input mounts
      const t = setTimeout(() => newFolderInputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [showNewFolderInput]);

  // Items shown inside the current folder
  const { subfolders, currentFiles } = useMemo(() => {
    const folders: AuditFileItem[] = [];
    const fileItems: AuditFileItem[] = [];
    const seenFolderNames = new Set<string>();

    for (const item of files) {
      const segments = splitPath(item.fileName);
      const inHere =
        segments.length === currentPath.length + 1 &&
        currentPath.every((seg, i) => seg === segments[i]);

      if (item.kind === "folder") {
        // Only show folders that are direct children of the current path
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

      // Synthesise an implicit folder row for any file living deeper than the
      // current level whose immediate parent isn't represented by a folder row.
      // This guards against files uploaded before folder rows existed.
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
  }, [files, currentPath]);

  const totalEntriesHere = subfolders.length + currentFiles.length;

  // Any non-folder file at or below the current path (used to enable Download all)
  const hasAnyFileHere = useMemo(() => {
    return files.some((f) => {
      if (f.kind !== "file") return false;
      if (!currentPrefix) return true;
      return f.fileName.startsWith(`${currentPrefix}/`);
    });
  }, [files, currentPrefix]);

  // ── API helpers ───────────────────────────────────────────────────────────
  const uploadFileApi = async (file: File) => {
    const fd = new FormData();
    fd.append("slot", slot);
    fd.append("file", file);
    fd.append("relativePath", `${currentPathStr}${file.name}`);
    const res = await fetch(`/api/audits/${auditId}/files`, { method: "POST", body: fd });
    if (!res.ok) throw new Error("Upload failed");
  };

  const createFolderApi = async (name: string) => {
    const fd = new FormData();
    fd.append("slot", slot);
    fd.append("kind", "folder");
    fd.append("path", `${currentPathStr}${name}`);
    const res = await fetch(`/api/audits/${auditId}/files`, { method: "POST", body: fd });
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

  const handleOpenInOffice = async (fileId: string) => {
    setOpeningInOfficeId(fileId);
    try {
      const res = await fetch(`/api/onedrive/open-url?fileId=${fileId}&type=audit-file`);
      const data = (await res.json()) as { webUrl?: string; error?: string };
      if (!res.ok || !data.webUrl) {
        alert(data.error ?? "Could not open file in Office Online");
        return;
      }
      window.open(data.webUrl, "_blank", "noopener,noreferrer");
    } catch {
      alert("Failed to open file in Office Online. Please try again.");
    } finally {
      setOpeningInOfficeId(null);
    }
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
      await fetch(`/api/audits/${auditId}/files?fileId=${targetId}`, { method: "DELETE" });
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
      // Virtual folder (no real DB row) — nothing to delete on the server.
      // Telling the user gives them a clearer mental model.
      alert("This folder is empty in the database. Delete the files it contains.");
      return;
    }
    const msg = isFolder
      ? `Delete folder "${displayName}" and everything inside it? This action cannot be undone.`
      : `Are you sure you want to delete "${displayName}"? This action cannot be undone.`;
    if (!confirm(msg)) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/audits/${auditId}/files?fileId=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");
      onUpdated();
    } catch {
      alert("Failed to delete.");
    } finally {
      setDeletingId(null);
    }
  };

  // ── Drag-and-drop (admin only, uploads to current folder) ─────────────────
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

  // ── Bulk download as zip (files in current folder, recursive) ─────────────
  const [zipping, setZipping] = useState(false);
  const handleDownloadAll = async () => {
    setZipping(true);
    try {
      const qs = new URLSearchParams({ slot });
      if (currentPrefix) qs.set("path", currentPrefix);
      const res = await fetch(
        `/api/audits/${auditId}/files/download-zip?${qs.toString()}`,
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        alert(data?.error ?? "Failed to build zip");
        return;
      }

      // Try to honour the server's filename, fall back to a sensible default
      const disp = res.headers.get("Content-Disposition") ?? "";
      const match = /filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i.exec(disp);
      const filename =
        (match?.[1] && decodeURIComponent(match[1])) ||
        `${currentPath[currentPath.length - 1] ?? SLOT_LABELS[slot]}.zip`;

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
      {/* Drag overlay */}
      {isDragging && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-blue-50/90 backdrop-blur-sm dark:bg-blue-900/40">
          <p className="text-sm font-semibold text-blue-700 dark:text-blue-200">
            📥 Drop files to upload into {currentPath.length === 0 ? SLOT_LABELS[slot] : currentPath[currentPath.length - 1]}
          </p>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-700">
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
              {SLOT_LABELS[slot]}
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
                title={`Create a folder inside ${currentPath.length === 0 ? SLOT_LABELS[slot] : currentPath[currentPath.length - 1]}`}
              >
                📁 New Folder
              </button>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={uploading}
                className="dark-blue-btn inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition disabled:opacity-50 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
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
        <p className="px-5 py-4 text-xs text-slate-400 dark:text-slate-500">
          {isAdmin
            ? "This folder is empty - drop files here, click Add File, or create a new folder."
            : "This folder is empty"}
        </p>
      ) : (
        <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-700">
          {/* Subfolders first */}
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
                    className="truncate text-xs font-semibold text-slate-900 transition group-hover:text-violet-700 hover:text-violet-700 dark:text-white"
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
                    className="dark-red-btn inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 transition disabled:opacity-50 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400"
                  >
                    🗑️ {deletingId === folder.id ? "Deleting…" : "Delete"}
                  </button>
                )}
              </li>
            );
          })}

          {/* Files in current folder */}
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
                      className="inline-flex items-center gap-1 rounded-lg border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700 transition hover:border-green-300 hover:bg-green-100 disabled:opacity-50 dark:border-green-800 dark:bg-green-900/30 dark:text-green-400"
                    >
                      {openingInOfficeId === f.id ? "Opening\u2026" : "\u270f\ufe0f Edit Online"}
                    </button>
                  )}
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => handleReplaceClick(f.id)}
                      disabled={replacingId === f.id}
                      className="dark-amber-btn inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 transition disabled:opacity-50 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                    >
                      {replacingId === f.id ? "Replacing…" : "🔄 Replace"}
                    </button>
                  )}
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => handleDelete(f.id, leafName, false)}
                      disabled={deletingId === f.id}
                      className="dark-red-btn inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 transition disabled:opacity-50 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400"
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

// ─── Progress Bar ──────────────────────────────────────────────────────────────

function AuditProgress({
  startDate,
  endDate,
  status,
}: {
  startDate: string | null;
  endDate: string | null;
  status: string;
}) {
  if (!startDate || !endDate) {
    return (
      <div className="flex h-full flex-col rounded-2xl border border-dashed border-slate-200 bg-white p-5 text-center shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-slate-400">
          Timeline
        </p>
        <p className="my-auto text-sm text-slate-400 dark:text-slate-500">
          📅 Set start and end dates to see progress
        </p>
      </div>
    );
  }

  const now = Date.now();
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  const total = end - start;
  const elapsed = Math.max(0, Math.min(now - start, total));
  const pct = total > 0 ? (elapsed / total) * 100 : 0;

  const dayMs = 24 * 60 * 60 * 1000;
  const daysUntilStart = Math.ceil((start - now) / dayMs);
  const daysRemaining = Math.ceil((end - now) / dayMs);
  const daysOverdue = Math.ceil((now - end) / dayMs);

  let label = "";
  let labelColor = "text-slate-500 dark:text-slate-400";
  if (status === "COMPLETED") {
    label = "Audit completed";
    labelColor = "text-blue-600 dark:text-blue-400";
  } else if (now < start) {
    label = `Starts in ${daysUntilStart} day${daysUntilStart === 1 ? "" : "s"}`;
    labelColor = "text-slate-500 dark:text-slate-400";
  } else if (now > end) {
    label = `Overdue by ${daysOverdue} day${daysOverdue === 1 ? "" : "s"}`;
    labelColor = "text-red-600 dark:text-red-400";
  } else {
    label = `${daysRemaining} day${daysRemaining === 1 ? "" : "s"} remaining`;
    labelColor = "text-green-600 dark:text-green-400";
  }

  const barColor =
    status === "COMPLETED"
      ? "bg-blue-500"
      : now > end
      ? "bg-red-500"
      : now < start
      ? "bg-slate-400"
      : "bg-green-500";

  return (
    <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
          Timeline
        </p>
        <p className={`text-xs font-semibold ${labelColor}`}>{label}</p>
      </div>
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
        <div
          className={`absolute left-0 top-0 h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${status === "COMPLETED" ? 100 : Math.max(0, Math.min(100, pct))}%` }}
        />
      </div>
      <div className="mt-2 flex justify-between text-[11px] font-medium text-slate-500 dark:text-slate-400">
        <span>{new Date(startDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
        <span>{new Date(endDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>
      </div>
    </div>
  );
}

// ─── Status Breakdown ──────────────────────────────────────────────────────────

function StatusBreakdown({ buckets }: { buckets: StatusBucket[] }) {
  const total = buckets.reduce((sum, b) => sum + b.count, 0);
  if (total === 0) {
    return (
      <div className="flex h-full flex-col rounded-2xl border border-dashed border-slate-200 bg-white p-5 text-center shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-slate-400">
          Requests by Status
        </p>
        <p className="my-auto text-sm text-slate-400 dark:text-slate-500">
          📊 No requests yet
        </p>
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
          Requests by Status
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400">{total} total</p>
      </div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
        {buckets.map((b) => (
          <div
            key={b.name}
            style={{ width: `${(b.count / total) * 100}%`, backgroundColor: b.color }}
            title={`${b.name}: ${b.count}`}
            className="transition-all"
          />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs">
        {buckets.map((b) => (
          <div key={b.name} className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: b.color }}
            />
            <span className="font-medium">{b.name}</span>
            <span className="text-slate-400 dark:text-slate-500">· {b.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Activity Feed ─────────────────────────────────────────────────────────────

function ActivityFeed({ items }: { items: ActivityItem[] }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-5 py-3 dark:border-slate-700">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
          Recent Activity
        </p>
      </div>
      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400 dark:text-slate-500">
          No activity yet
        </p>
      ) : (
      <ul className="max-h-[600px] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-700">
        {items.map((a) => {
          const cfg = ACTIVITY_ICON[a.action] ?? { icon: "•", color: "text-slate-400" };
          return (
            <li key={a.id} className="flex items-start gap-3 px-5 py-3 text-sm">
              <span className={`mt-0.5 text-lg ${cfg.color}`}>{cfg.icon}</span>
              <div className="min-w-0 flex-1">
                <p className="text-slate-700 dark:text-slate-300">
                  <span className="font-semibold text-slate-900 dark:text-white">{a.actorName}</span>{" "}
                  <span className="text-slate-500 dark:text-slate-400">{activityVerb(a.action)}</span>{" "}
                  {a.targetTitle && (
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      {a.targetTitle}
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                  {timeAgo(a.createdAt)}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
      )}
    </div>
  );
}

// ─── Main UI ───────────────────────────────────────────────────────────────────

type AuditDashboardProps = {
  audit: {
    id: string;
    trackId: string | null;
    title: string;
    description: string | null;
    status: string;
    startDate: string | null;
    endDate: string | null;
    createdByName: string;
    updatedAt: string;
    outlookEventId: string | null;
    lockedByName: string | null;
    requestsCount: number;
    myAssignedCount: number;
    avgOpenMs: number;
    statusBreakdown: StatusBucket[];
    agendaFiles: AuditFileItem[];
    readyBoxFiles: AuditFileItem[];
    activity: ActivityItem[];
  };
  isAdmin?: boolean;
  canCreateRequest?: boolean;
};

export default function AuditDashboardUI({ audit, isAdmin = false, canCreateRequest = false }: AuditDashboardProps) {
  const { setActiveAudit } = useAuditNav();
  const router = useRouter();

  const [agendaFiles, setAgendaFiles] = useState<AuditFileItem[]>(audit.agendaFiles);
  const [readyBoxFiles, setReadyBoxFiles] = useState<AuditFileItem[]>(audit.readyBoxFiles);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [lockError, setLockError] = useState<{ lockedByName: string } | null>(null);
  const [previewFile, setPreviewFile] = useState<AuditFileItem | null>(null);

  useEffect(() => {
    setActiveAudit({ id: audit.id, title: audit.title, tab: "home", canCreateRequest: isAdmin || canCreateRequest });
    return () => setActiveAudit(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audit.id, audit.title, isAdmin, canCreateRequest]);

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete "${audit.title}"? This action cannot be undone.`)) return;
    setIsDeleting(true);
    const result = await deleteAudit(audit.id);
    if (result.ok) {
      router.push("/adminDashboard");
    } else {
      alert(result.error ?? "Failed to delete audit");
      setIsDeleting(false);
    }
  };

  const handleExportConfirm = async (type: ExportType) => {
    setShowExportModal(false);
    setIsExporting(true);
    try {
      const res = await fetch(`/api/audits/${audit.id}/export?type=${type}`);
      if (!res.ok) { alert("Failed to export audit"); return; }
      const blob = await res.blob();
      const safeName = audit.title.replace(/[^a-zA-Z0-9_\- ]/g, "").trim() || "audit";
      const filename = type === "zip" ? `${safeName}_export.zip` : `${safeName}_export.xlsx`;
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      alert("Failed to export audit");
    } finally {
      setIsExporting(false);
    }
  };

  const handleEditClick = async () => {
    try {
      const res = await fetch(`/api/audits/${audit.id}/lock`);
      if (res.ok) {
        const data = (await res.json()) as { locked: boolean; lockedByName?: string };
        if (data.locked) {
          setLockError({ lockedByName: data.lockedByName ?? "Another user" });
          return;
        }
      }
    } catch {
      // allow navigation if lock check fails
    }
    router.push(`/adminDashboard/editAudit/${audit.id}`);
  };

  const handleUpdated = async () => {
    const [agendaRes, readyBoxRes] = await Promise.all([
      fetch(`/api/audits/${audit.id}/files?slot=agenda`),
      fetch(`/api/audits/${audit.id}/files?slot=readyBox`),
    ]);
    if (agendaRes.ok) setAgendaFiles((await agendaRes.json()) as AuditFileItem[]);
    if (readyBoxRes.ok) setReadyBoxFiles((await readyBoxRes.json()) as AuditFileItem[]);
  };

  const fmtOpts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  };
  const startLabel = audit.startDate
    ? new Date(audit.startDate).toLocaleDateString("en-GB", fmtOpts)
    : "—";
  const endLabel = audit.endDate
    ? new Date(audit.endDate).toLocaleDateString("en-GB", fmtOpts)
    : "Present";
  const dateRange =
    audit.startDate && audit.endDate && audit.startDate === audit.endDate
      ? startLabel
      : `${startLabel} → ${endLabel}`;

  const statusConfig = {
    ACTIVE: { label: "Active", className: "bg-green-50 text-green-700 ring-green-200" },
    DRAFT: { label: "Draft", className: "bg-slate-100 text-slate-700 ring-slate-200" },
    COMPLETED: { label: "Completed", className: "bg-blue-50 text-blue-700 ring-blue-200" },
  } as const;
  const status = statusConfig[audit.status as keyof typeof statusConfig] ?? statusConfig.DRAFT;

  // Determine base path from current URL
  const pathname = usePathname();
  const dashboardMatch = pathname.match(/^\/(adminDashboard|userDashboard|auditOwnerDashboard)\/audits\/[^/]+/);
  const baseRoute = dashboardMatch?.[0] ?? (isAdmin ? `/adminDashboard/audits/${audit.id}` : `/userDashboard/audits/${audit.id}`);

  const totalFiles =
    agendaFiles.filter((f) => f.kind === "file").length +
    readyBoxFiles.filter((f) => f.kind === "file").length;

  // Outlook calendar URL (works with Microsoft Graph event IDs in OWA)
  const outlookUrl = useMemo(() => {
    if (!audit.outlookEventId) return null;
    return `https://outlook.office.com/calendar/item/${encodeURIComponent(audit.outlookEventId)}`;
  }, [audit.outlookEventId]);

  return (
    <>
      {previewFile && <FilePreviewLightbox file={previewFile} onClose={() => setPreviewFile(null)} />}
      {showExportModal && (
        <ExportModal
          auditTitle={audit.title}
          onConfirm={handleExportConfirm}
          onClose={() => setShowExportModal(false)}
        />
      )}

      {lockError && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
          onClick={() => setLockError(null)}
        >
          <div
            className="flex max-w-sm flex-col items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="text-3xl">🔒</span>
            <h3 className="text-base font-semibold text-amber-900">Editing Locked</h3>
            <p className="text-sm text-amber-800">
              <strong>{lockError.lockedByName}</strong> is currently editing this audit. You can still
              view it, but editing is unavailable until they finish.
            </p>
            <button
              type="button"
              onClick={() => setLockError(null)}
              className="mt-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              OK
            </button>
          </div>
        </div>
      )}

      <div className="relative min-h-screen bg-slate-50 dark:bg-slate-900">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-blue-50 via-cyan-50/40 to-transparent dark:from-slate-800/40 dark:via-transparent" />

        <div className="relative mx-auto w-full max-w-none px-4 py-10 sm:px-6 lg:px-8 xl:px-10">
          {/* Audit header card */}
          <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <div className="flex flex-col gap-4">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-slate-50 text-3xl ring-1 ring-slate-200 dark:bg-slate-700 dark:ring-slate-600">
                  📋
                </div>
                <div className="flex-1">
                  <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl dark:text-white">
                    {audit.title}
                  </h1>
                  {audit.trackId && (
                    <div className="mt-2">
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 font-mono text-sm font-bold tracking-wide text-blue-700 dark:border-blue-700/50 dark:bg-blue-900/20 dark:text-blue-300">
                        <span className="text-blue-400 dark:text-blue-500">#</span>
                        {audit.trackId}
                      </span>
                    </div>
                  )}
                  {audit.description && (
                    <p className="mt-1 max-w-2xl whitespace-pre-line text-sm text-slate-500 dark:text-slate-400">
                      {audit.description}
                    </p>
                  )}
                  <div className="mt-2 flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-400">
                    <span className="inline-flex items-center gap-1.5">📅 {dateRange}</span>
                    {audit.createdByName && (
                      <span className="inline-flex items-center gap-1">
                        👤 <span className="text-slate-400">Created by</span>{" "}
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          {audit.createdByName}
                        </span>
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
                      🕒 Updated {timeAgo(audit.updatedAt)}
                    </span>
                  </div>
                </div>
                <span
                  className={`inline-flex shrink-0 items-center rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${status.className}`}
                >
                  {status.label.toUpperCase()}
                </span>
              </div>

              {/* Info chips */}
              {(audit.lockedByName || outlookUrl) && (
                <div className="flex flex-wrap items-center gap-2">
                  {audit.lockedByName && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:ring-amber-800">
                      🔒 {audit.lockedByName} is editing
                    </span>
                  )}
                  {outlookUrl && (
                    <a
                      href={outlookUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 ring-1 ring-indigo-200 transition hover:bg-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-300 dark:ring-indigo-800 dark:hover:bg-indigo-900/50"
                    >
                      📅 Open in Outlook
                    </a>
                  )}
                </div>
              )}

              {/* Navigation to other audit sections */}
              <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4 dark:border-slate-700">
                {canCreateRequest && (
                  <Link
                    href={`${baseRoute}/requests/new`}
                    className="dark-blue-link inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 transition dark:border-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                  >
                    ➕ New Request
                  </Link>
                )}
                <Link
                  href={`${baseRoute}/requests`}
                  className="dark-amber-link inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 transition dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                >
                  📝 Requests
                </Link>
                <Link
                  href={`${baseRoute}/chats`}
                  className="dark-purple-link inline-flex items-center gap-1.5 rounded-xl border border-purple-200 bg-purple-50 px-4 py-2 text-sm font-semibold text-purple-700 transition dark:border-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
                >
                  💬 Chats
                </Link>
                <Link
                  href={`${baseRoute}/kanbanBoard`}
                  className="dark-cyan-link inline-flex items-center gap-1.5 rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-2 text-sm font-semibold text-cyan-700 transition dark:border-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300"
                >
                  📊 Board
                </Link>
                <Link
                  href={`${baseRoute}/assignees`}
                  className="dark-emerald-link inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                >
                  👥 Assignees
                </Link>
              </div>

              {isAdmin && (
                <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={() => setShowExportModal(true)}
                    disabled={isExporting}
                    className="dark-green-btn inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-green-200 bg-green-50 px-4 py-2 text-sm font-semibold text-green-700 transition hover:bg-green-100 disabled:opacity-50 dark:border-green-700 dark:bg-green-900/40 dark:text-green-300 dark:hover:bg-green-800"
                  >
                    📥 {isExporting ? "Exporting…" : "Export"}
                  </button>
                  <button
                    type="button"
                    onClick={handleEditClick}
                    className="dark-blue-btn inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-800"
                  >
                    ✏️ Edit
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="dark-red-btn inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-50 dark:border-red-700 dark:bg-red-900/40 dark:text-red-300 dark:hover:bg-red-800"
                  >
                    🗑️ {isDeleting ? "Deleting…" : "Delete"}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Main grid layout: 2/3 main content + 1/3 activity sidebar */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* ─── Left: main column (2/3) ─── */}
            <div className="flex flex-col gap-6 lg:col-span-2">
              {/* Stats grid */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Link
                  href={`${baseRoute}/requests`}
                  className="group flex flex-col items-center rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md hover:ring-2 hover:ring-amber-200 dark:border-slate-700 dark:bg-slate-800 dark:hover:ring-amber-500/40"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-xl ring-1 ring-slate-200 dark:bg-slate-700 dark:ring-slate-600">
                    📝
                  </div>
                  <p className="mt-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Total Requests
                  </p>
                  <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                    {audit.requestsCount}
                  </p>
                </Link>

                <div className="flex flex-col items-center rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-xl ring-1 ring-slate-200 dark:bg-slate-700 dark:ring-slate-600">
                    👤
                  </div>
                  <p className="mt-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    My Requests
                  </p>
                  <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                    {audit.myAssignedCount}
                  </p>
                </div>

                <div className="flex flex-col items-center rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800" title="Average time requests are open. Closed/Cancelled/On Hold requests use their close time; open requests use today.">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-xl ring-1 ring-slate-200 dark:bg-slate-700 dark:ring-slate-600">
                    ⏱️
                  </div>
                  <p className="mt-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Avg Request Open Time
                  </p>
                  <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                    {audit.requestsCount === 0 ? "—" : formatDuration(audit.avgOpenMs)}
                  </p>
                </div>

                <div className="flex flex-col items-center rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-xl ring-1 ring-slate-200 dark:bg-slate-700 dark:ring-slate-600">
                    📁
                  </div>
                  <p className="mt-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Files
                  </p>
                  <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                    {totalFiles}
                  </p>
                </div>
              </div>

              {/* Progress + Status side by side */}
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <AuditProgress
                  startDate={audit.startDate}
                  endDate={audit.endDate}
                  status={audit.status}
                />
                <StatusBreakdown buckets={audit.statusBreakdown} />
              </div>

              {/* Audit Files */}
              <div>
                <h2 className="mb-3 text-base font-semibold text-slate-900 dark:text-white">
                  Audit Files
                </h2>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <FileSlot
                    slot="agenda"
                    auditId={audit.id}
                    files={agendaFiles}
                    isAdmin={isAdmin}
                    onUpdated={handleUpdated}
                    onPreview={setPreviewFile}
                    defaultFolders={[
                      ["Audit Agenda"],
                      ["Audit Follow-Up and Report"],
                    ]}
                  />
                  <FileSlot
                    slot="readyBox"
                    auditId={audit.id}
                    files={readyBoxFiles}
                    isAdmin={isAdmin}
                    onUpdated={handleUpdated}
                    onPreview={setPreviewFile}
                  />
                </div>
              </div>
            </div>

            {/* ─── Right: activity sidebar (1/3) ─── */}
            <aside className="lg:col-span-1">
              <div className="lg:sticky lg:top-6">
                <ActivityFeed items={audit.activity} />
              </div>
            </aside>
          </div>
        </div>
      </div>
    </>
  );
}

