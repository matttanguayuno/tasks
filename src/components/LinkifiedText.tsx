"use client";

import { useState, useRef, useEffect, useCallback } from "react";

const URL_REGEX = /(https?:\/\/[^\s<>)"',]+)/g;
const URL_TEST = /^https?:\/\/[^\s<>)"',]+$/;
const MD_LINK_REGEX = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/;

type Segment = { type: 'text'; text: string } | { type: 'link'; text: string; url: string };

function parseSegments(text: string): Segment[] {
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
}

export function LinkPopup({ url, anchorRect, onClose }: LinkPopupProps) {
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
    </div>
  );
}

interface LinkifiedTextProps {
  text: string;
  className?: string;
  children?: React.ReactNode;
  interactive?: boolean;
}

export function LinkifiedText({ text, className, children, interactive = true }: LinkifiedTextProps) {
  const [popup, setPopup] = useState<{ url: string; rect: DOMRect } | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressUrl = useRef<string | null>(null);

  const handleClose = useCallback(() => setPopup(null), []);

  const handleLinkClick = (e: React.MouseEvent, url: string) => {
    e.stopPropagation();
    // Left click without modifier: show popup
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setPopup({ url, rect });
  };

  const handleTouchStart = (url: string, e: React.TouchEvent) => {
    longPressUrl.current = url;
    longPressTimer.current = setTimeout(() => {
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      setPopup({ url, rect });
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
              if (interactive) handleLinkClick(e, seg.url);
            }}
            onTouchStart={(e) => handleTouchStart(seg.url, e)}
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
      {popup && <LinkPopup url={popup.url} anchorRect={popup.rect} onClose={handleClose} />}
    </span>
  );
}
