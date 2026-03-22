"use client";

import { useState, useRef, useEffect, useCallback } from "react";

const URL_REGEX = /(https?:\/\/[^\s<>)"',]+)/g;
const URL_TEST = /^https?:\/\/[^\s<>)"',]+$/;
const MD_LINK_REGEX = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/;

type Segment = { type: 'text'; text: string } | { type: 'link'; text: string; url: string };

export function parseSegments(text: string): Segment[] {
  const segments: Segment[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    const match = MD_LINK_REGEX.exec(remaining);
    if (!match) {
      // No more markdown links — split the rest by bare URLs
      const urlParts = remaining.split(URL_REGEX);
      for (const part of urlParts) {
        if (!part) continue;
        if (URL_TEST.test(part)) segments.push({ type: 'link', text: part, url: part });
        else segments.push({ type: 'text', text: part });
      }
      break;
    }
    // Text before the markdown link
    if (match.index > 0) {
      const before = remaining.substring(0, match.index);
      const urlParts = before.split(URL_REGEX);
      for (const part of urlParts) {
        if (!part) continue;
        if (URL_TEST.test(part)) segments.push({ type: 'link', text: part, url: part });
        else segments.push({ type: 'text', text: part });
      }
    }
    segments.push({ type: 'link', text: match[1], url: match[2] });
    remaining = remaining.substring(match.index + match[0].length);
  }
  return segments;
}

interface LinkPopupProps {
  url: string;
  anchorRect: DOMRect;
  onClose: () => void;
  onEdit?: (url: string, text: string) => void;
  onRemove?: (url: string, text: string) => void;
  linkText?: string;
}

export function LinkPopup({ url, anchorRect, onClose, onEdit, onRemove, linkText }: LinkPopupProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handle);
    document.addEventListener("touchstart", handle);
    return () => {
      document.removeEventListener("mousedown", handle);
      document.removeEventListener("touchstart", handle);
    };
  }, [onClose]);

  const top = anchorRect.bottom + 4;
  const left = anchorRect.left;

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 px-1"
      style={{ top, left }}
    >
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 px-3 py-1.5 text-sm text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
      >
        <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
        <span className="truncate max-w-[250px]">{url}</span>
      </a>
      {onEdit && (
        <button
          onClick={(e) => { e.stopPropagation(); onClose(); onEdit(url, linkText || ""); }}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded transition-colors w-full"
        >
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          Edit link
        </button>
      )}
      {onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onClose(); onRemove(url, linkText || ""); }}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded transition-colors w-full"
        >
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
          Remove link
        </button>
      )}
    </div>
  );
}

interface LinkifiedTextProps {
  text: string;
  className?: string;
  children?: React.ReactNode;
  interactive?: boolean;
  onEditLink?: (oldText: string, oldUrl: string) => void;
  onRemoveLink?: (url: string, text: string) => void;
}

export function LinkifiedText({ text, className, children, interactive = true, onEditLink, onRemoveLink }: LinkifiedTextProps) {
  const [popup, setPopup] = useState<{ url: string; rect: DOMRect; text: string } | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressUrl = useRef<string | null>(null);

  const handleClose = useCallback(() => setPopup(null), []);

  const handleLinkClick = (e: React.MouseEvent, url: string, linkText: string) => {
    e.stopPropagation();
    // Left click without modifier: show popup
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setPopup({ url, rect, text: linkText });
  };

  const handleTouchStart = (url: string, linkText: string, e: React.TouchEvent) => {
    longPressUrl.current = url;
    longPressTimer.current = setTimeout(() => {
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      setPopup({ url, rect, text: linkText });
    }, 500);
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const segments = parseSegments(text);

  return (
    <span className={className}>
      {segments.map((seg, i) =>
        seg.type === 'link' ? (
          <a
            key={i}
            href={seg.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-600 underline decoration-indigo-300 hover:decoration-indigo-600 cursor-pointer"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              if (interactive) e.stopPropagation();
              if (e.ctrlKey || e.metaKey) {
                return;
              }
              e.preventDefault();
              if (interactive) handleLinkClick(e, seg.url, seg.text);
            }}
            onTouchStart={(e) => handleTouchStart(seg.url, seg.text, e)}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
          >
            {seg.text}
          </a>
        ) : (
          <span key={i}>{seg.text}</span>
        )
      )}
      {children}
      {popup && <LinkPopup url={popup.url} anchorRect={popup.rect} onClose={handleClose} onEdit={onEditLink} onRemove={onRemoveLink} linkText={popup.text} />}
    </span>
  );
}
