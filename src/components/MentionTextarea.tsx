"use client";

import { useEffect, useRef, useState, useCallback, type ReactNode } from "react";

type Person = { id: string; name: string; image?: string | null };

function getInitials(name: string) {
  const local = name.includes("@") ? (name.split("@")[0] ?? name) : name;
  const cleaned = local.replace(/\(.*?\)/g, "").trim();
  const parts = cleaned.split(/[\s._\-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return (parts[0] ?? "?").slice(0, 2).toUpperCase();
  return (((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase() || "?");
}

/** Render comment text with @mentions highlighted */
export function renderMentionText(text: string, people: { name: string }[]): ReactNode {
  if (people.length === 0) return text;
  const sortedNames = [...people].map((p) => p.name).sort((a, b) => b.length - a.length);
  const escaped = sortedNames.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`(@(?:${escaped.join("|")}))`, "gi");
  const parts = text.split(pattern);
  const lowerSet = new Set(sortedNames.map((n) => `@${n.toLowerCase()}`));
  return (
    <>
      {parts.map((part, i) =>
        lowerSet.has(part.toLowerCase()) ? (
          <span key={i} className="font-semibold text-blue-600">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}

export default function MentionTextarea({
  people,
  placeholder,
  value,
  onChange,
  onKeyDown: externalKeyDown,
  rows = 2,
  className,
}: {
  people: Person[];
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  rows?: number;
  className?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStartIndex, setMentionStartIndex] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filteredPeople =
    mentionQuery !== null
      ? people.filter((p) => p.name.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 8)
      : [];

  const detectMention = useCallback((text: string, cursorPos: number) => {
    const beforeCursor = text.slice(0, cursorPos);
    const atIndex = beforeCursor.lastIndexOf("@");
    if (atIndex === -1) {
      setMentionQuery(null);
      return;
    }
    // @ must be at start or preceded by whitespace
    if (atIndex > 0 && !/\s/.test(beforeCursor[atIndex - 1]!)) {
      setMentionQuery(null);
      return;
    }
    const query = beforeCursor.slice(atIndex + 1);
    if (query.includes("\n")) {
      setMentionQuery(null);
      return;
    }
    setMentionQuery(query);
    setMentionStartIndex(atIndex);
    setSelectedIndex(0);
  }, []);

  const insertMention = useCallback(
    (person: Person) => {
      const textarea = textareaRef.current;
      if (!textarea || mentionQuery === null) return;
      const before = value.slice(0, mentionStartIndex);
      const after = value.slice(mentionStartIndex + 1 + mentionQuery.length);
      const newText = `${before}@${person.name} ${after}`;
      onChange(newText);
      setMentionQuery(null);
      requestAnimationFrame(() => {
        const cursorPos = mentionStartIndex + person.name.length + 2;
        textarea.focus();
        textarea.setSelectionRange(cursorPos, cursorPos);
      });
    },
    [mentionQuery, mentionStartIndex, value, onChange],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionQuery !== null && filteredPeople.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % filteredPeople.length);
        return;
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => (i - 1 + filteredPeople.length) % filteredPeople.length);
        return;
      } else if (e.key === "Enter") {
        e.preventDefault();
        insertMention(filteredPeople[selectedIndex]!);
        return;
      } else if (e.key === "Escape") {
        e.preventDefault();
        setMentionQuery(null);
        return;
      }
    }
    externalKeyDown?.(e);
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setMentionQuery(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative flex-1">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          detectMention(e.target.value, e.target.selectionStart);
        }}
        onKeyDown={handleKeyDown}
        onClick={(e) => {
          detectMention(value, (e.target as HTMLTextAreaElement).selectionStart);
        }}
        placeholder={placeholder}
        rows={rows}
        className={className}
      />
      {mentionQuery !== null && filteredPeople.length > 0 && (
        <div className="absolute bottom-full left-0 z-50 mb-1 w-72 max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
          {filteredPeople.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                insertMention(p);
              }}
              className={`flex w-full items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 ${
                i === selectedIndex ? "bg-blue-50" : ""
              }`}
            >
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-700 ring-1 ring-slate-200">
                {p.image ? (
                  <img src={p.image} alt={p.name} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-[9px] font-bold text-white">{getInitials(p.name)}</span>
                )}
              </span>
              <span className="truncate">{p.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
