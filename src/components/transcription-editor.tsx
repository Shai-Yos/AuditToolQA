"use client";

import { useEditor, EditorContent, ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent, Node as TiptapNode } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect, useRef, useCallback, useState, useMemo } from "react";

// ── Toolbar Button ──────────────────────────────────────────────────
function Btn({
  active,
  onClick,
  title,
  children,
  disabled,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      className={[
        "flex h-7 w-7 items-center justify-center rounded-md text-xs font-bold transition",
        active
          ? "bg-amber-200 text-amber-900 dark:bg-amber-500/35 dark:text-amber-100"
          : "text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-amber-200/90 dark:hover:bg-amber-900/40 dark:hover:text-amber-100",
        disabled ? "opacity-30 cursor-not-allowed" : "",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <div className="mx-1 h-5 w-px bg-slate-200 dark:bg-amber-700/40" />;
}

// ── Parse HTML into heading-based sections ───────────────────────────
function parseTranscriptionSections(html: string) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const nodes = Array.from(doc.body.children);
  const sections: { id: string; level: number; headingHtml: string; bodyHtml: string }[] = [];
  let preamble = "";
  let current: { id: string; level: number; headingHtml: string; bodyParts: string[] } | null = null;

  for (const node of nodes) {
    const tag = node.tagName.toLowerCase();
    if (tag === "h1" || tag === "h2" || tag === "h3") {
      if (current) {
        sections.push({ id: current.id, level: current.level, headingHtml: current.headingHtml, bodyHtml: current.bodyParts.join("") });
      }
      current = { id: `s${sections.length}`, level: parseInt(tag[1]!), headingHtml: node.innerHTML, bodyParts: [] };
    } else {
      if (current) {
        current.bodyParts.push(node.outerHTML);
      } else {
        preamble += node.outerHTML;
      }
    }
  }
  if (current) {
    sections.push({ id: current.id, level: current.level, headingHtml: current.headingHtml, bodyHtml: current.bodyParts.join("") });
  }
  return { preamble, sections };
}

// ── Collapsible Heading NodeView + Extension ────────────────────────
const collapsibleKey = new PluginKey<{ collapsed: Set<string> }>("collapsibleHeadings");

function HeadingNodeView(props: any) {
  const { node, getPos, editor } = props as {
    node: { attrs: { level: number }; nodeSize: number };
    getPos: (() => number) | boolean;
    editor: any;
  };
  const level = (node.attrs.level ?? 1) as 1 | 2 | 3;
  const pos = typeof getPos === "function" ? getPos() : 0;

  // Stable index: count headings before this position in the document
  let headingIndex = 0;
  editor.state.doc.forEach((n: any, offset: number) => {
    if (offset < pos && n.type.name === "heading") headingIndex++;
  });
  const id = `h-${headingIndex}`;

  // Whether there is any content after this heading before the next same-or-higher heading
  let hasBody = false;
  let afterThis = false;
  editor.state.doc.forEach((n: any, offset: number) => {
    if (offset === pos) { afterThis = true; return; }
    if (!afterThis || hasBody) return;
    if (n.type.name === "heading" && (n.attrs.level as number) <= level) { afterThis = false; return; }
    hasBody = true;
  });

  const pluginState = collapsibleKey.getState(editor.state) as { collapsed: Set<string> } | null;
  const isCollapsed = pluginState?.collapsed.has(id) ?? false;

  const toggle = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    editor.view.dispatch(editor.view.state.tr.setMeta(collapsibleKey, { toggle: id }));
  }, [editor, id]);

  return (
    <NodeViewWrapper className="flex items-baseline gap-1 group">
      <span
        onMouseDown={toggle}
        className={[
          "shrink-0 text-[9px] w-3.5 text-center leading-none select-none transition-colors mt-[0.2em]",
          hasBody
            ? "text-slate-300 group-hover:text-slate-500 dark:text-slate-500 dark:group-hover:text-slate-300 cursor-pointer"
            : "opacity-0 pointer-events-none",
        ].join(" ")}
      >
        {isCollapsed ? "▶" : "▼"}
      </span>
      <NodeViewContent
        className={[
          "flex-1 !m-0 !p-0 outline-none",
          level === 1 ? "text-lg font-bold text-slate-900 dark:text-slate-100" : level === 2 ? "text-base font-semibold text-slate-800 dark:text-slate-200" : "text-sm font-semibold text-slate-700 dark:text-slate-300",
        ].join(" ")}
      />
    </NodeViewWrapper>
  );
}

const CollapsibleHeadingExtension = TiptapNode.create({
  name: "heading",
  group: "block",
  content: "inline*",
  defining: true,

  addAttributes() {
    return { level: { default: 1, rendered: false } };
  },

  parseHTML() {
    return [
      { tag: "h1", attrs: { level: 1 } },
      { tag: "h2", attrs: { level: 2 } },
      { tag: "h3", attrs: { level: 3 } },
    ];
  },

  renderHTML({ node }: any) {
    return [`h${node.attrs.level}`, {}, 0];
  },

  addCommands() {
    return {
      setHeading:
        (attributes: { level: number }) =>
        ({ commands }: any) =>
          commands.setNode(this.name, attributes),
      toggleHeading:
        (attributes: { level: number }) =>
        ({ commands }: any) =>
          commands.toggleNode(this.name, "paragraph", attributes),
    } as any;
  },

  addKeyboardShortcuts() {
    return {
      "Mod-Alt-1": () => (this.editor.commands as any).toggleHeading({ level: 1 }),
      "Mod-Alt-2": () => (this.editor.commands as any).toggleHeading({ level: 2 }),
      "Mod-Alt-3": () => (this.editor.commands as any).toggleHeading({ level: 3 }),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(HeadingNodeView);
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: collapsibleKey,
        state: {
          init: () => ({ collapsed: new Set<string>() }),
          apply(tr, prev) {
            const meta = tr.getMeta(collapsibleKey) as { toggle?: string } | undefined;
            if (!meta?.toggle) return prev;
            const next = new Set(prev.collapsed);
            if (next.has(meta.toggle)) next.delete(meta.toggle); else next.add(meta.toggle);
            return { collapsed: next };
          },
        },
        props: {
          decorations(state) {
            const ps = collapsibleKey.getState(state) as { collapsed: Set<string> } | null;
            if (!ps || ps.collapsed.size === 0) return DecorationSet.empty;
            const { collapsed } = ps;
            const decorations: Decoration[] = [];
            let hi = 0;
            const stack: number[] = [];
            state.doc.forEach((node: any, offset: number) => {
              if (node.type.name === "heading") {
                const lv = node.attrs.level as number;
                const nid = `h-${hi++}`;
                while (stack.length > 0 && stack[stack.length - 1]! >= lv) stack.pop();
                if (stack.length > 0) {
                  decorations.push(Decoration.node(offset, offset + node.nodeSize, { style: "display:none" }));
                }
                if (collapsed.has(nid)) stack.push(lv);
              } else if (stack.length > 0) {
                decorations.push(Decoration.node(offset, offset + node.nodeSize, { style: "display:none" }));
              }
            });
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});

// ── Immutable Author Stamp ───────────────────────────────────────────
// Rendered when a new author starts editing. It's an atomic node with no
// editable content, so its author/time text can never be typed over or
// altered in place. A ProseMirror guard plugin (below) also blocks any
// transaction that would delete an existing stamp (backspace, select-all
// delete, cut, drag-out, etc.), so once written a stamp is fully immutable.
// The only exception is a full external content resync (see
// STAMP_BYPASS_META), which legitimately replaces the whole document.
// Legacy stamps saved before this node existed (plain <blockquote> HTML,
// no data-author-stamp marker) are also recognized structurally via a
// second parseHTML rule, so previously-saved stamps get the exact same
// immutability protection as new ones.
const STAMP_BYPASS_META = "authorStampBypass";

function countAuthorStamps(doc: any): number {
  let count = 0;
  doc.descendants((node: any) => {
    if (node.type.name === "authorStamp") count++;
    return true;
  });
  return count;
}

const AuthorStamp = TiptapNode.create({
  name: "authorStamp",
  group: "block",
  atom: true,
  selectable: false,
  draggable: false,

  addAttributes() {
    return {
      id: { default: null },
      author: { default: "" },
      time: { default: "" },
    };
  },

  parseHTML() {
    return [
      {
        tag: "blockquote[data-author-stamp]",
        getAttrs: (el: any) => ({
          id: el.getAttribute("data-id") ?? null,
          author: el.getAttribute("data-author") ?? "",
          time: el.getAttribute("data-time") ?? "",
        }),
      },
      {
        // Legacy stamps saved before the immutable-node fix have no
        // data-author-stamp marker — just a plain
        // `<blockquote><em><strong>Name</strong> · time</em></blockquote>`.
        // Recognize that exact shape structurally so previously-saved
        // stamps also become fully-immutable atomic nodes on load, not
        // just newly-created ones. High priority so this is tried before
        // StarterKit's generic blockquote parse rule.
        tag: "blockquote",
        priority: 1000,
        getAttrs: (el: any) => {
          if (el.children.length !== 1) return false;
          const em = el.children[0];
          if (!em || em.tagName !== "EM") return false;
          const strong = em.querySelector("strong");
          if (!strong || em.children.length !== 1) return false;
          const author = (strong.textContent || "").trim();
          if (!author) return false;
          const time = (em.textContent || "")
            .slice((strong.textContent || "").length)
            .replace(/^[\s·:.\-|]+/, "")
            .trim();
          return { id: null, author, time };
        },
      },
    ];
  },

  renderHTML({ node }: any) {
    return [
      "blockquote",
      {
        "data-author-stamp": "true",
        "data-id": node.attrs.id,
        "data-author": node.attrs.author,
        "data-time": node.attrs.time,
        contenteditable: "false",
        class: "select-none",
      },
      ["em", {}, ["strong", {}, node.attrs.author], ` · ${node.attrs.time}`],
    ];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("authorStampGuard"),
        filterTransaction(tr) {
          if (!tr.docChanged || tr.getMeta(STAMP_BYPASS_META)) return true;
          const before = countAuthorStamps(tr.before);
          if (before === 0) return true;
          // Block any transaction that reduces the number of stamps in the
          // document — this protects every stamp (including ones saved
          // before the `id` attribute existed) from being merged away,
          // backspaced, cut, or replaced by a select-all delete.
          return countAuthorStamps(tr.doc) >= before;
        },
        // Prevent the caret from ever resting directly on a stamp's line.
        // The doc position immediately before/after an authorStamp is a
        // valid (but visually confusing) empty text selection, so clicking
        // the stamp or arrowing into it would leave the cursor blinking on
        // the name/timestamp line. Whenever the selection lands there, walk
        // past every consecutive stamp and settle inside the nearest real
        // paragraph instead.
        appendTransaction(trs, oldState, newState) {
          if (!trs.some((tr) => tr.selectionSet || tr.docChanged)) return null;
          const sel = newState.selection;
          if (!(sel instanceof TextSelection) || !sel.empty) return null;

          const touchesStamp = (p: any) =>
            p.nodeBefore?.type.name === "authorStamp" || p.nodeAfter?.type.name === "authorStamp";

          let $pos = sel.$from;
          if (!touchesStamp($pos)) return null;

          const forward = sel.from >= oldState.selection.from;
          let pos = sel.from;
          while (touchesStamp($pos)) {
            const neighbor = forward ? $pos.nodeAfter : $pos.nodeBefore;
            if (!neighbor) break;
            pos = forward ? pos + neighbor.nodeSize : pos - neighbor.nodeSize;
            $pos = newState.doc.resolve(pos);
          }
          if (pos === sel.from) return null;

          const tr = newState.tr.setSelection(TextSelection.near(newState.doc.resolve(pos), forward ? 1 : -1));
          tr.setMeta("addToHistory", false);
          return tr;
        },
      }),
    ];
  },
});

// ── Toolbar ─────────────────────────────────────────────────────────
function Toolbar({
  editor,
  onInsertAuthorStamp,
  canInsertAuthorStamp,
  fontSize,
  onFontSizeChange,
}: {
  editor: ReturnType<typeof useEditor> | null;
  onInsertAuthorStamp?: () => void;
  canInsertAuthorStamp?: boolean;
  fontSize: 12 | 13 | 14 | 16 | 18;
  onFontSizeChange: (size: 12 | 13 | 14 | 16 | 18) => void;
}) {
  if (!editor) return null;

  const fontSizes: Array<12 | 13 | 14 | 16 | 18> = [12, 13, 14, 16, 18];
  const sizeIndex = fontSizes.indexOf(fontSize);
  const canDecrease = sizeIndex > 0;
  const canIncrease = sizeIndex >= 0 && sizeIndex < fontSizes.length - 1;

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-amber-200 bg-amber-50/80 px-2 py-1.5 shrink-0 dark:border-amber-700/50 dark:bg-amber-950/35">
      <Btn
        title="Bold (Ctrl+B)"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        B
      </Btn>
      <Btn
        title="Italic (Ctrl+I)"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <span className="italic">I</span>
      </Btn>
      <Btn
        title="Underline (Ctrl+U)"
        active={editor.isActive("underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <span className="underline">U</span>
      </Btn>
      <Btn
        title="Strikethrough"
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <span className="line-through">S</span>
      </Btn>

      <Sep />

      <div className="inline-flex items-center gap-1 rounded-xl border border-amber-300 bg-white/95 px-1.5 py-1 shadow-sm ring-1 ring-amber-100/80 dark:border-amber-600/50 dark:bg-amber-950/35 dark:ring-amber-800/40">
        <span className="hidden md:inline pl-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-700 dark:text-amber-200">Size</span>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            if (!canDecrease) return;
            onFontSizeChange(fontSizes[sizeIndex - 1]!);
          }}
          disabled={!canDecrease}
          className="inline-flex h-6 w-6 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-[14px] font-bold leading-none text-amber-800 transition hover:border-amber-300 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70 disabled:cursor-not-allowed disabled:opacity-40 dark:border-amber-600/50 dark:bg-amber-950/35 dark:text-amber-100 dark:hover:border-amber-400/60 dark:hover:bg-amber-900/45 dark:focus-visible:ring-amber-500/50"
          title="Decrease text size"
          aria-label="Decrease text size"
        >
          -
        </button>
        <span
          className="inline-flex h-6 min-w-[3.5rem] items-center justify-center rounded-lg border border-amber-200 bg-amber-100/80 px-2 text-[11px] font-semibold tabular-nums text-amber-900 shadow-inner shadow-amber-200/30 dark:border-amber-600/50 dark:bg-amber-950/35 dark:text-amber-100 dark:shadow-amber-950/30"
          title="Current text size"
          aria-label="Current text size"
        >
          {fontSize}
        </span>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            if (!canIncrease) return;
            onFontSizeChange(fontSizes[sizeIndex + 1]!);
          }}
          disabled={!canIncrease}
          className="inline-flex h-6 w-6 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-[14px] font-bold leading-none text-amber-800 transition hover:border-amber-300 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70 disabled:cursor-not-allowed disabled:opacity-40 dark:border-amber-600/50 dark:bg-amber-950/35 dark:text-amber-100 dark:hover:border-amber-400/60 dark:hover:bg-amber-900/45 dark:focus-visible:ring-amber-500/50"
          title="Increase text size"
          aria-label="Increase text size"
        >
          +
        </button>
      </div>

      <Sep />

      <Btn
        title="Heading 1"
        active={editor.isActive("heading", { level: 1 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
      >
        H1
      </Btn>
      <Btn
        title="Heading 2"
        active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        H2
      </Btn>
      <Btn
        title="Heading 3"
        active={editor.isActive("heading", { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        H3
      </Btn>

      <Sep />

      <Btn
        title="Bullet list"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
          <path fillRule="evenodd" d="M6 4.75A.75.75 0 0 1 6.75 4h10.5a.75.75 0 0 1 0 1.5H6.75A.75.75 0 0 1 6 4.75ZM6 10a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H6.75A.75.75 0 0 1 6 10Zm0 5.25a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H6.75a.75.75 0 0 1-.75-.75ZM1.99 4.75a1 1 0 0 1 1-1h.01a1 1 0 0 1 1 1v.01a1 1 0 0 1-1 1h-.01a1 1 0 0 1-1-1v-.01ZM2.99 9a1 1 0 0 0-1 1v.01a1 1 0 0 0 1 1h.01a1 1 0 0 0 1-1V10a1 1 0 0 0-1-1h-.01ZM1.99 15.25a1 1 0 0 1 1-1h.01a1 1 0 0 1 1 1v.01a1 1 0 0 1-1 1h-.01a1 1 0 0 1-1-1v-.01Z" clipRule="evenodd" />
        </svg>
      </Btn>
      <Btn
        title="Numbered list"
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
          <path fillRule="evenodd" d="M6 4.75A.75.75 0 0 1 6.75 4h10.5a.75.75 0 0 1 0 1.5H6.75A.75.75 0 0 1 6 4.75ZM6 10a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H6.75A.75.75 0 0 1 6 10Zm0 5.25a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H6.75a.75.75 0 0 1-.75-.75Z" clipRule="evenodd" />
          <text x="1.5" y="6" fontSize="5" fontWeight="bold" fill="currentColor">1</text>
          <text x="1.5" y="11.5" fontSize="5" fontWeight="bold" fill="currentColor">2</text>
          <text x="1.5" y="17" fontSize="5" fontWeight="bold" fill="currentColor">3</text>
        </svg>
      </Btn>

      <Sep />

      <Btn
        title="Blockquote"
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
          <path fillRule="evenodd" d="M2 3.75A.75.75 0 0 1 2.75 3h11.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 3.75Zm4 4A.75.75 0 0 1 6.75 7h8.5a.75.75 0 0 1 0 1.5h-8.5A.75.75 0 0 1 6 7.75Zm0 4A.75.75 0 0 1 6.75 11h8.5a.75.75 0 0 1 0 1.5h-8.5a.75.75 0 0 1-.75-.75Zm-4 4A.75.75 0 0 1 2.75 15h11.5a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1-.75-.75Z" clipRule="evenodd" />
        </svg>
      </Btn>
      <Btn
        title="Horizontal rule"
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
      >
        ─
      </Btn>

      <Sep />

      <Btn
        title="Insert author/time label"
        onClick={() => onInsertAuthorStamp?.()}
        disabled={!canInsertAuthorStamp}
      >
        ⏱
      </Btn>

      <Sep />

      <Btn
        title="Undo (Ctrl+Z)"
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
          <path fillRule="evenodd" d="M7.793 2.232a.75.75 0 0 1-.025 1.06L3.622 7.25h10.003a5.375 5.375 0 0 1 0 10.75H10.75a.75.75 0 0 1 0-1.5h2.875a3.875 3.875 0 0 0 0-7.75H3.622l4.146 3.957a.75.75 0 0 1-1.036 1.085l-5.5-5.25a.75.75 0 0 1 0-1.085l5.5-5.25a.75.75 0 0 1 1.06.025Z" clipRule="evenodd" />
        </svg>
      </Btn>
      <Btn
        title="Redo (Ctrl+Shift+Z)"
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
          <path fillRule="evenodd" d="M12.207 2.232a.75.75 0 0 1 1.06-.025l5.5 5.25a.75.75 0 0 1 0 1.085l-5.5 5.25a.75.75 0 0 1-1.036-1.085l4.146-3.957H6.375a3.875 3.875 0 0 0 0 7.75H9.25a.75.75 0 0 1 0 1.5H6.375a5.375 5.375 0 0 1 0-10.75h10.003l-4.146-3.957a.75.75 0 0 1-.025-1.06Z" clipRule="evenodd" />
        </svg>
      </Btn>
    </div>
  );
}

// ── Editor component ────────────────────────────────────────────────
export function TranscriptionEditor({
  content,
  onUpdate,
  onExternalUpdate,
  readOnly,
  placeholder,
  scrollRef: externalScrollRef,
  onScroll,
  currentAuthor,
  onRequestShortcut,
  stampStorageKey,
  textSize = 13,
}: {
  content: string;
  onUpdate?: (html: string) => void;
  onExternalUpdate?: () => void;
  readOnly?: boolean;
  placeholder?: string;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  onScroll?: () => void;
  currentAuthor?: string;
  /** Called with selected text when the scribe clicks the floating "+ Request" button */
  onRequestShortcut?: (title: string) => void;
  /** sessionStorage key to persist last-stamped author across page refreshes */
  stampStorageKey?: string;
  /** Optional text size in pixels for transcription content */
  textSize?: 12 | 13 | 14 | 16 | 18;
}) {
  const onUpdateRef = useRef(onUpdate);
  const onRequestShortcutRef = useRef(onRequestShortcut);
  const scrollRef = useRef<HTMLDivElement>(null);
  const outerRef = useRef<HTMLDivElement>(null);
  const isLocalEdit = useRef(false);
  const sizeStorageKey = stampStorageKey ? `ts-font-size-${stampStorageKey}` : null;
  useEffect(() => { onUpdateRef.current = onUpdate; }, [onUpdate]);
  useEffect(() => { onRequestShortcutRef.current = onRequestShortcut; }, [onRequestShortcut]);
  const [selectionText, setSelectionText] = useState<string | null>(null);
  const [btnPos, setBtnPos] = useState<{ top: number; left: number } | null>(null);
  const [editorTextSize, setEditorTextSize] = useState<12 | 13 | 14 | 16 | 18>(() => {
    if (typeof window === "undefined" || !sizeStorageKey) return textSize;
    const raw = Number(localStorage.getItem(sizeStorageKey));
    if (raw === 12 || raw === 13 || raw === 14 || raw === 16 || raw === 18) {
      return raw;
    }
    return textSize;
  });

  useEffect(() => {
    if (!sizeStorageKey) return;
    const raw = Number(localStorage.getItem(sizeStorageKey));
    if (raw === 12 || raw === 13 || raw === 14 || raw === 16 || raw === 18) {
      setEditorTextSize(raw);
      return;
    }
    setEditorTextSize(textSize);
  }, [sizeStorageKey, textSize]);

  useEffect(() => {
    if (!sizeStorageKey) return;
    localStorage.setItem(sizeStorageKey, String(editorTextSize));
  }, [sizeStorageKey, editorTextSize]);

  const typography = useMemo(() => {
    switch (editorTextSize) {
      case 12:
        return {
          body: "text-[12px]",
          h123: "prose-h1:text-base prose-h2:text-sm prose-h3:text-xs",
          h1: "text-sm font-bold text-slate-900 dark:text-slate-100",
          h2: "text-xs font-semibold text-slate-800 dark:text-slate-200",
          h3: "text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide",
        };
      case 14:
        return {
          body: "text-[14px]",
          h123: "prose-h1:text-xl prose-h2:text-lg prose-h3:text-base",
          h1: "text-lg font-bold text-slate-900 dark:text-slate-100",
          h2: "text-base font-semibold text-slate-800 dark:text-slate-200",
          h3: "text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide",
        };
      case 16:
        return {
          body: "text-[16px]",
          h123: "prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg",
          h1: "text-xl font-bold text-slate-900 dark:text-slate-100",
          h2: "text-lg font-semibold text-slate-800 dark:text-slate-200",
          h3: "text-base font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide",
        };
      case 18:
        return {
          body: "text-[18px]",
          h123: "prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl",
          h1: "text-2xl font-bold text-slate-900 dark:text-slate-100",
          h2: "text-xl font-semibold text-slate-800 dark:text-slate-200",
          h3: "text-lg font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide",
        };
      case 13:
      default:
        return {
          body: "text-[13px]",
          h123: "prose-h1:text-lg prose-h2:text-base prose-h3:text-sm",
          h1: "text-base font-bold text-slate-900 dark:text-slate-100",
          h2: "text-sm font-semibold text-slate-800 dark:text-slate-200",
          h3: "text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide",
        };
    }
  }, [editorTextSize]);

  // Auto-stamp tracking — only insert stamp when a different user starts editing
  const currentAuthorRef = useRef(currentAuthor);
  useEffect(() => { currentAuthorRef.current = currentAuthor; }, [currentAuthor]);
  const stampKey = stampStorageKey ? `ts-stamp-${stampStorageKey}` : null;
  const lastStampedAuthorRef = useRef<string | null>(
    stampKey ? (typeof sessionStorage !== "undefined" ? sessionStorage.getItem(stampKey) : null) : null
  );

  // Collapsible sections for read-only view
  const { preamble, sections } = useMemo(() => {
    if (!readOnly || typeof window === "undefined") return { preamble: "", sections: [] as ReturnType<typeof parseTranscriptionSections>["sections"] };
    return parseTranscriptionSections(content);
  }, [readOnly, content]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleCollapse = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handleUpdate = useCallback(
    ({ editor }: { editor: { getHTML: () => string } }) => {
      isLocalEdit.current = true;
      onUpdateRef.current?.(editor.getHTML());
    },
    [],
  );

  const insertAuthorStamp = useCallback((ed: any) => {
    const author = currentAuthorRef.current;
    if (!author) return;

    lastStampedAuthorRef.current = author;
    if (stampKey) sessionStorage.setItem(stampKey, author);

    const now = new Date();
    const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const datePart = `${String(now.getUTCDate()).padStart(2, "0")} ${monthNames[now.getUTCMonth()]!} ${now.getUTCFullYear()}`;
    const timePart = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "UTC",
    }).format(now);
    const time = `${datePart} ${timePart} UTC`;

    ed.chain()
      .focus("end")
      .insertContent([
        { type: "authorStamp", attrs: { id: crypto.randomUUID(), author, time } },
        { type: "paragraph" },
      ])
      .focus("end")
      .run();
  }, [stampKey]);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
      }),
      CollapsibleHeadingExtension,
      AuthorStamp,
      Underline,
      Link.configure({
        openOnClick: true,
        HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" },
      }),
      Placeholder.configure({
        placeholder: placeholder ?? "Start typing your transcription notes…",
      }),
    ],
    content,
    editable: !readOnly,
    onUpdate: handleUpdate,
    onSelectionUpdate: ({ editor: ed }: { editor: any }) => {
      if (!onRequestShortcutRef.current) return;
      const { from, to } = ed.state.selection;
      if (from === to) { setSelectionText(null); setBtnPos(null); return; }
      const text = (ed.state.doc.textBetween(from, to, " ") as string).trim();
      if (!text) { setSelectionText(null); setBtnPos(null); return; }
      setSelectionText(text);
      requestAnimationFrame(() => {
        const start = ed.view.coordsAtPos(from) as { top: number; left: number };
        const container = outerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        setBtnPos({
          top: Math.max(8, start.top - rect.top - 34),
          left: Math.max(0, start.left - rect.left),
        });
      });
    },
    onFocus: ({ editor: ed }) => {
      const author = currentAuthorRef.current;
      if (!author) return;
      // Determine the author of the LAST stamp actually present in the
      // document right now, instead of trusting the sessionStorage-backed
      // ref alone. That ref can go stale (e.g. the doc was cleared/replaced
      // by another user, or this is a brand-new blank room reusing an old
      // sessionStorage value from a previous session) — relying on it alone
      // meant a genuinely blank/unstamped document could silently skip
      // stamping because "this author already stamped last time".
      let lastDocAuthor: string | null = null;
      let lastDocTime: string | null = null;
      ed.state.doc.descendants((node: any) => {
        if (node.type.name === "authorStamp") {
          lastDocAuthor = node.attrs.author;
          lastDocTime = node.attrs.time ?? null;
        }
        return true;
      });
      const hasDateInStamp = typeof lastDocTime === "string"
        ? /\b\d{2}\s+[a-z]{3}\s+\d{4}\b/i.test(lastDocTime)
        : false;
      if (lastDocAuthor === author && hasDateInStamp) return;
      requestAnimationFrame(() => {
        insertAuthorStamp(ed);
      });
    },
    editorProps: {
      attributes: {
        class: [
          "prose prose-sm max-w-none outline-none min-h-full px-4 pt-3 pb-10 leading-relaxed text-slate-800 dark:text-slate-200",
          typography.body,
          "prose-headings:text-slate-900 prose-headings:font-semibold dark:prose-headings:text-slate-100",
          typography.h123,
          "prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0",
          "prose-blockquote:border-amber-300 prose-blockquote:text-slate-600 dark:prose-blockquote:border-amber-500/40 dark:prose-blockquote:text-slate-300",
          readOnly ? "cursor-default" : "",
        ].join(" "),
      },
    },
  });

  // Sync external content changes from polling/collaboration updates.
  // Skip when the change originated from local typing (isLocalEdit flag).
  const lastExternalContent = useRef(content);
  const onExternalUpdateRef = useRef(onExternalUpdate);
  useEffect(() => { onExternalUpdateRef.current = onExternalUpdate; }, [onExternalUpdate]);
  useEffect(() => {
    if (!editor) return;
    if (isLocalEdit.current) {
      // This content change came from the user's own typing — don't reset the editor
      isLocalEdit.current = false;
      lastExternalContent.current = content;
      return;
    }
    if (content !== lastExternalContent.current) {
      lastExternalContent.current = content;
      // Bypass the author-stamp deletion guard: this is a full resync of the
      // document from the server, not a user edit, so it's allowed to
      // replace stamps wholesale (the incoming content already contains the
      // correct stamps from prior saves).
      editor
        .chain()
        .command(({ tr }) => {
          tr.setMeta(STAMP_BYPASS_META, true);
          return true;
        })
        .setContent(content, { emitUpdate: false })
        .run();
      // External content arrived — clear stamp author so whoever focuses next will stamp
      lastStampedAuthorRef.current = null;
      if (stampKey) sessionStorage.removeItem(stampKey);
      // Notify parent so it can scroll to bottom after DOM updates
      requestAnimationFrame(() => onExternalUpdateRef.current?.());
    }
  }, [editor, content, stampKey]);

  // Sync editable state
  useEffect(() => {
    if (editor) editor.setEditable(!readOnly);
  }, [editor, readOnly]);

  // Keep transcription pinned to the latest line.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [content]);

  return (
    <div ref={outerRef} className="flex flex-col flex-1 min-h-0 relative">
      {!readOnly && (
        <Toolbar
          editor={editor}
          onInsertAuthorStamp={() => {
            if (editor) insertAuthorStamp(editor);
          }}
          canInsertAuthorStamp={Boolean(currentAuthorRef.current)}
          fontSize={editorTextSize}
          onFontSizeChange={setEditorTextSize}
        />
      )}
      {!readOnly && selectionText && btnPos && onRequestShortcutRef.current && (
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            const title = selectionText;
            setSelectionText(null);
            setBtnPos(null);
            onRequestShortcutRef.current?.(title);
          }}
          style={{ top: btnPos.top, left: btnPos.left }}
          className="absolute z-30 flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800 shadow-sm hover:bg-amber-100 hover:border-amber-400 transition-colors dark:border-amber-600/50 dark:bg-amber-900/50 dark:text-amber-100 dark:hover:border-amber-400/80 dark:hover:bg-amber-800/60"
        >
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          Request
        </button>
      )}
      <div
        ref={(node) => {
          (scrollRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
          if (externalScrollRef) (externalScrollRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
        }}
        onScroll={onScroll}
        className="flex-1 overflow-auto"
      >
        {readOnly ? (
          <div className="px-4 py-3">
            {preamble && (
              <div
                className={[
                  "prose prose-sm max-w-none leading-relaxed text-slate-800 dark:text-slate-200 prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-blockquote:border-amber-300 prose-blockquote:text-slate-600 dark:prose-blockquote:border-amber-500/40 dark:prose-blockquote:text-slate-300",
                  typography.body,
                ].join(" ")}
                dangerouslySetInnerHTML={{ __html: preamble }}
              />
            )}
            {sections.length === 0 && !preamble && (
              <p className="text-slate-400 dark:text-slate-500 text-sm italic">No transcription yet.</p>
            )}
            {sections.map((section) => {
              const isCollapsed = collapsed.has(section.id);
              const hasBody = section.bodyHtml.replace(/<[^>]*>/g, "").trim().length > 0;
              return (
                <div key={section.id} className="mb-0.5">
                  <div
                    role="button"
                    tabIndex={0}
                    className="flex items-center gap-1.5 group select-none cursor-pointer rounded py-0.5 hover:bg-amber-50/60 dark:hover:bg-slate-800 transition-colors -ml-1 pl-1"
                    onClick={() => toggleCollapse(section.id)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleCollapse(section.id); } }}
                  >
                    <span className="shrink-0 w-3.5 text-[9px] text-slate-400 group-hover:text-slate-600 dark:text-slate-500 dark:group-hover:text-slate-300 transition-colors text-center leading-none tabular-nums">
                      {hasBody ? (isCollapsed ? "▶" : "▼") : ""}
                    </span>
                    <span
                      className={section.level === 1 ? typography.h1 : section.level === 2 ? typography.h2 : typography.h3}
                      dangerouslySetInnerHTML={{ __html: section.headingHtml }}
                    />
                  </div>
                  {!isCollapsed && section.bodyHtml && (
                    <div
                      className={[
                        "ml-5 prose prose-sm max-w-none leading-relaxed text-slate-800 dark:text-slate-200 prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-blockquote:border-amber-300 prose-blockquote:text-slate-600 dark:prose-blockquote:border-amber-500/40 dark:prose-blockquote:text-slate-300",
                        typography.body,
                      ].join(" ")}
                      dangerouslySetInnerHTML={{ __html: section.bodyHtml }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <EditorContent editor={editor} className="min-h-full" />
        )}
      </div>
    </div>
  );
}
