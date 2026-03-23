"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { api } from "@/lib/api";
import type { Sprint, SprintWithTasks, SprintTask, TaskLinkInfo } from "@/lib/types";

interface LineageViewProps {
  projectId: string;
  selectedTaskId?: string | null;
  onSelectTask?: (taskId: string) => void;
  onDeselectTask?: () => void;
}

const LINK_TYPE_COLORS: Record<string, string> = {
  RELATED: "#f59e0b",
  PRECEDED_BY: "#10b981",
};

const LINK_TYPE_LABELS: Record<string, string> = {
  RELATED: "Related",
  PRECEDED_BY: "Preceded by",
};

const SIBLING_COLOR = "#8b5cf6"; // purple for parent-child lines

const COL_WIDTH = 260;
const COL_GAP = 80; // space between columns for visible lines
const COL_STRIDE = COL_WIDTH + COL_GAP;

type LinkRow = { fromTaskId: string; toTaskId: string; linkType: string; id: string };

/** Auto-sort ALL sprints together to minimise line crossings.
 *  Strategy:
 *  1. Process sprints left-to-right.
 *  2. For each sprint, assign every task a "target row" = average position of its
 *     linked partners in the previously-sorted sprint. Tasks with no cross-sprint
 *     links keep their cluster-relative order.
 *  3. Within each sprint, group same-sprint connected components (clusters) and
 *     parent-child relations so they stay adjacent, then arrange those clusters
 *     at positions that best match their average target row.
 */
function autoSortAllSprints(
  sprintOrder: string[],                         // ordered sprint IDs (left→right)
  dataMap: Map<string, SprintWithTasks>,
  links: LinkRow[],
  manualSprints: Set<string>,
): Map<string, SprintWithTasks> {
  // Build cross-sprint adjacency: taskId → set of linked taskIds (any sprint)
  const crossAdj = new Map<string, Set<string>>();
  for (const link of links) {
    if (!crossAdj.has(link.fromTaskId)) crossAdj.set(link.fromTaskId, new Set());
    if (!crossAdj.has(link.toTaskId)) crossAdj.set(link.toTaskId, new Set());
    crossAdj.get(link.fromTaskId)!.add(link.toTaskId);
    crossAdj.get(link.toTaskId)!.add(link.fromTaskId);
  }

  // Track taskId → assigned row index (updated as we sort each sprint)
  const taskPosition = new Map<string, number>();

  const result = new Map(dataMap);

  for (const sprintId of sprintOrder) {
    const sprintFull = result.get(sprintId);
    if (!sprintFull || manualSprints.has(sprintId)) {
      // Still record positions for manually-ordered sprints so later sprints can reference them
      if (sprintFull) {
        sprintFull.sprintTasks.forEach((st, i) => taskPosition.set(st.taskId, i));
      }
      continue;
    }

    const tasks = [...sprintFull.sprintTasks];
    if (tasks.length <= 1) {
      tasks.forEach((st, i) => taskPosition.set(st.taskId, i));
      continue;
    }

    const taskIds = new Set(tasks.map((t) => t.taskId));

    // Build within-sprint adjacency (for clustering)
    const localAdj = new Map<string, Set<string>>();
    for (const id of taskIds) localAdj.set(id, new Set());
    for (const link of links) {
      if (taskIds.has(link.fromTaskId) && taskIds.has(link.toTaskId)) {
        localAdj.get(link.fromTaskId)!.add(link.toTaskId);
        localAdj.get(link.toTaskId)!.add(link.fromTaskId);
      }
    }
    for (const st of tasks) {
      if (st.task.parentId && taskIds.has(st.task.parentId)) {
        localAdj.get(st.taskId)!.add(st.task.parentId);
        localAdj.get(st.task.parentId)!.add(st.taskId);
      }
    }

    // Find connected components via BFS
    const visited = new Set<string>();
    const clusters: string[][] = [];
    for (const st of tasks) {
      if (visited.has(st.taskId)) continue;
      const cluster: string[] = [];
      const queue = [st.taskId];
      while (queue.length) {
        const id = queue.shift()!;
        if (visited.has(id)) continue;
        visited.add(id);
        cluster.push(id);
        for (const n of localAdj.get(id) || []) {
          if (!visited.has(n)) queue.push(n);
        }
      }
      clusters.push(cluster);
    }

    const taskMap = new Map(tasks.map((t) => [t.taskId, t]));
    const origIndex = new Map(tasks.map((t, i) => [t.taskId, i]));

    // For each task compute a "target row" = average position of its cross-sprint linked partners
    // that have already been positioned
    const targetRow = new Map<string, number>();
    for (const st of tasks) {
      const neighbors = crossAdj.get(st.taskId);
      if (!neighbors) continue;
      const positions: number[] = [];
      for (const nId of neighbors) {
        if (taskIds.has(nId)) continue; // skip same-sprint links for cross-sprint alignment
        const pos = taskPosition.get(nId);
        if (pos !== undefined) positions.push(pos);
      }
      if (positions.length > 0) {
        targetRow.set(st.taskId, positions.reduce((a, b) => a + b, 0) / positions.length);
      }
    }

    // Sort each cluster internally: parent before child, then by original order
    for (const cluster of clusters) {
      cluster.sort((a, b) => {
        const ta = taskMap.get(a)!;
        const tb = taskMap.get(b)!;
        if (tb.task.parentId === a) return -1;
        if (ta.task.parentId === b) return 1;
        return (origIndex.get(a) ?? 0) - (origIndex.get(b) ?? 0);
      });
    }

    // Compute each cluster's target row = average target of its members (or fallback to origIndex)
    const clusterTarget = (cluster: string[]): number => {
      const targets = cluster.map((id) => targetRow.get(id)).filter((t): t is number => t !== undefined);
      if (targets.length > 0) return targets.reduce((a, b) => a + b, 0) / targets.length;
      // Fallback: average original index, shifted to end if no links at all
      return cluster.reduce((sum, id) => sum + (origIndex.get(id) ?? 0), 0) / cluster.length;
    };

    // Sort clusters by their target position
    clusters.sort((a, b) => clusterTarget(a) - clusterTarget(b));

    // Flatten sorted clusters
    const sorted: SprintTask[] = [];
    for (const cluster of clusters) {
      for (const id of cluster) sorted.push(taskMap.get(id)!);
    }

    // Record positions
    sorted.forEach((st, i) => taskPosition.set(st.taskId, i));
    result.set(sprintId, { ...sprintFull, sprintTasks: sorted });
  }

  return result;
}

export default function LineageView({ projectId, selectedTaskId, onSelectTask, onDeselectTask }: LineageViewProps) {
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [sprintData, setSprintData] = useState<Map<string, SprintWithTasks>>(new Map());
  const [loading, setLoading] = useState(true);
  const [allLinks, setAllLinks] = useState<LinkRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Drag-to-link state
  const [dragFrom, setDragFrom] = useState<string | null>(null);
  const [dragTo, setDragTo] = useState<string | null>(null);
  const [linkTypeMenu, setLinkTypeMenu] = useState<{ fromId: string; toId: string; x: number; y: number } | null>(null);
  const [dragLine, setDragLine] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);

  // Drag-to-reorder state
  const [reorderDrag, setReorderDrag] = useState<{
    sprintId: string;
    taskId: string;
    startY: number;
    currentY: number;
    originalIndex: number;
  } | null>(null);
  const [reorderPreview, setReorderPreview] = useState<Map<string, SprintTask[]>>(new Map());
  const hasManualOrder = useRef<Set<string>>(new Set()); // sprint IDs that user has manually reordered

  // Track card positions for SVG lines
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  const [linePositions, setLinePositions] = useState<(LinkRow & { x1: number; y1: number; x2: number; y2: number; sameColumn: boolean })[]>([]);
  const [siblingLines, setSiblingLines] = useState<{ key: string; x1: number; y1: number; x2: number; y2: number }[]>([]);

  // Build taskId → sprintNumber lookup
  const taskSprintMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const [, data] of sprintData) {
      for (const st of data.sprintTasks) {
        // find sprint number from sprints array
        const sprint = sprints.find((s) => s.id === st.sprintId);
        if (sprint) m.set(st.taskId, sprint.number);
      }
    }
    return m;
  }, [sprintData, sprints]);

  // Build parent-child pairs within same sprint for sibling visualization
  const siblingPairs = useMemo(() => {
    const pairs: { parentTaskId: string; childTaskId: string; sprintId: string }[] = [];
    for (const [, data] of sprintData) {
      const taskIds = new Set(data.sprintTasks.map((st) => st.taskId));
      for (const st of data.sprintTasks) {
        if (st.task.parentId && taskIds.has(st.task.parentId)) {
          pairs.push({ parentTaskId: st.task.parentId, childTaskId: st.taskId, sprintId: st.sprintId });
        }
      }
    }
    return pairs;
  }, [sprintData]);

  // Load all sprints and their tasks
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sprintList = (await api.sprints.list(projectId)) as Sprint[];
      setSprints(sprintList);

      const dataEntries = await Promise.all(
        sprintList.map(async (s) => {
          const full = (await api.sprints.get(projectId, s.id)) as SprintWithTasks;
          return [s.id, full] as [string, SprintWithTasks];
        })
      );
      setSprintData(new Map(dataEntries));

      const allTaskIds = new Set<string>();
      for (const [, sprint] of dataEntries) {
        for (const st of sprint.sprintTasks) {
          allTaskIds.add(st.taskId);
        }
      }

      const linkResults = await Promise.all(
        Array.from(allTaskIds).map(async (taskId) => {
          try {
            const links = (await api.taskLinks.list(taskId)) as TaskLinkInfo[];
            return links.map((l) => ({
              id: l.id,
              fromTaskId: l.direction === "outgoing" ? taskId : l.task.id,
              toTaskId: l.direction === "outgoing" ? l.task.id : taskId,
              linkType: l.linkType,
            }));
          } catch { return []; }
        })
      );

      const linkMap = new Map<string, LinkRow>();
      for (const batch of linkResults) {
        for (const link of batch) {
          linkMap.set(link.id, link);
        }
      }
      const dedupedLinks = Array.from(linkMap.values());
      setAllLinks(dedupedLinks);

      // Auto-sort all sprints together to minimize line crossings
      const sprintOrder = sprintList.map((s) => s.id);
      const rawDataMap = new Map(dataEntries);
      const sortedDataMap = autoSortAllSprints(sprintOrder, rawDataMap, dedupedLinks, hasManualOrder.current);
      setSprintData(sortedDataMap);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load lineage data");
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Compute link line positions + sibling lines from card DOM refs
  const computeLinePositions = useCallback(() => {
    if (!containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const scrollLeft = containerRef.current.scrollLeft;
    const scrollTop = containerRef.current.scrollTop;

    const positions: typeof linePositions = [];
    for (const link of allLinks) {
      const fromEl = cardRefs.current.get(link.fromTaskId);
      const toEl = cardRefs.current.get(link.toTaskId);
      if (!fromEl || !toEl) continue;

      const fromRect = fromEl.getBoundingClientRect();
      const toRect = toEl.getBoundingClientRect();

      // Determine which side to connect from/to based on relative position
      const fromRight = fromRect.right - containerRect.left + scrollLeft;
      const fromLeft = fromRect.left - containerRect.left + scrollLeft;
      const toRight = toRect.right - containerRect.left + scrollLeft;
      const toLeft = toRect.left - containerRect.left + scrollLeft;
      const fromCy = fromRect.top + fromRect.height / 2 - containerRect.top + scrollTop;
      const toCy = toRect.top + toRect.height / 2 - containerRect.top + scrollTop;

      // Connect right edge of left card → left edge of right card
      if (fromRight <= toLeft) {
        positions.push({ ...link, x1: fromRight, y1: fromCy, x2: toLeft, y2: toCy, sameColumn: false });
      } else if (toRight <= fromLeft) {
        positions.push({ ...link, x1: fromLeft, y1: fromCy, x2: toRight, y2: toCy, sameColumn: false });
      } else {
        // Same column — connect from right edges, will loop out to the right
        positions.push({ ...link, x1: fromRight, y1: fromCy, x2: fromRight, y2: toCy, sameColumn: true });
      }
    }
    setLinePositions(positions);

    // Compute sibling (parent-child) lines within same sprint
    const sLines: typeof siblingLines = [];
    for (const pair of siblingPairs) {
      const parentEl = cardRefs.current.get(pair.parentTaskId);
      const childEl = cardRefs.current.get(pair.childTaskId);
      if (!parentEl || !childEl) continue;

      const pRect = parentEl.getBoundingClientRect();
      const cRect = childEl.getBoundingClientRect();

      sLines.push({
        key: `${pair.parentTaskId}-${pair.childTaskId}`,
        x1: pRect.left + 12 - containerRect.left + scrollLeft,
        y1: pRect.bottom - containerRect.top + scrollTop,
        x2: cRect.left + 12 - containerRect.left + scrollLeft,
        y2: cRect.top - containerRect.top + scrollTop,
      });
    }
    setSiblingLines(sLines);
  }, [allLinks, siblingPairs]);

  useEffect(() => {
    const timer = setTimeout(computeLinePositions, 100);
    return () => clearTimeout(timer);
  }, [computeLinePositions, sprintData]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener("scroll", computeLinePositions);
    window.addEventListener("resize", computeLinePositions);
    return () => {
      container.removeEventListener("scroll", computeLinePositions);
      window.removeEventListener("resize", computeLinePositions);
    };
  }, [computeLinePositions]);

  // Handle drag-to-link
  const handleDragStart = (taskId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragFrom(taskId);

    const cardEl = cardRefs.current.get(taskId);
    if (!cardEl || !containerRef.current) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const cardRect = cardEl.getBoundingClientRect();
    const handleRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const scrollLeft = containerRef.current.scrollLeft;
    const scrollTop = containerRef.current.scrollTop;
    // Start line from the handle position (left or right side)
    const isLeftHandle = handleRect.left < cardRect.left + cardRect.width / 2;
    const startX = (isLeftHandle ? cardRect.left : cardRect.right) - containerRect.left + scrollLeft;
    const startY = cardRect.top + cardRect.height / 2 - containerRect.top + scrollTop;
    setDragLine({ x1: startX, y1: startY, x2: startX, y2: startY });

    const handleMouseMove = (ev: MouseEvent) => {
      if (!containerRef.current) return;
      const cr = containerRef.current.getBoundingClientRect();
      const mx = ev.clientX - cr.left + containerRef.current.scrollLeft;
      const my = ev.clientY - cr.top + containerRef.current.scrollTop;
      setDragLine((prev) => prev ? { ...prev, x2: mx, y2: my } : null);

      // elementFromPoint to detect hover target — hide SVG momentarily to avoid hit-test issues
      const svgOverlay = containerRef.current.querySelector("svg");
      if (svgOverlay) svgOverlay.style.display = "none";
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      if (svgOverlay) svgOverlay.style.display = "";

      const card = el?.closest("[data-task-id]") as HTMLElement | null;
      if (card && card.dataset.taskId !== taskId) {
        setDragTo(card.dataset.taskId!);
      } else {
        setDragTo(null);
      }
    };

    const handleMouseUp = (ev: MouseEvent) => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);

      // Hide SVG to ensure elementFromPoint finds the card
      if (containerRef.current) {
        const svgOverlay = containerRef.current.querySelector("svg");
        if (svgOverlay) svgOverlay.style.display = "none";
        const el = document.elementFromPoint(ev.clientX, ev.clientY);
        if (svgOverlay) svgOverlay.style.display = "";

        const card = el?.closest("[data-task-id]") as HTMLElement | null;
        if (card && card.dataset.taskId && card.dataset.taskId !== taskId) {
          const toId = card.dataset.taskId;

          // Auto-infer link type based on sprint order
          const fromSprint = taskSprintMap.get(taskId);
          const toSprint = taskSprintMap.get(toId);

          if (fromSprint != null && toSprint != null && fromSprint !== toSprint) {
            // Cross-sprint: auto-create PRECEDED_BY with correct direction
            // from=earlier sprint task, to=later sprint task
            // Arrow: earlier → later. Labels: earlier "precedes" later, later "preceded by" earlier
            if (fromSprint < toSprint) {
              handleCreateLink(taskId, toId, "PRECEDED_BY");
            } else {
              handleCreateLink(toId, taskId, "PRECEDED_BY");
            }
          } else {
            // Same sprint or unknown → show menu for manual selection
            setLinkTypeMenu({ fromId: taskId, toId, x: ev.clientX, y: ev.clientY });
          }
        }
      }

      setDragFrom(null);
      setDragTo(null);
      setDragLine(null);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const handleCreateLink = async (fromId: string, toId: string, linkType: string) => {
    setLinkTypeMenu(null);
    try {
      await api.taskLinks.create(fromId, toId, linkType);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create link");
    }
  };

  const handleDeleteLink = async (linkId: string, taskId: string) => {
    try {
      await api.taskLinks.delete(taskId, linkId);
      setSelectedLinkId(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete link");
    }
  };

  // Delete key removes selected link
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === "Delete" || e.key === "Backspace") && selectedLinkId) {
        e.preventDefault();
        const link = allLinks.find((l) => l.id === selectedLinkId);
        if (link) handleDeleteLink(link.id, link.fromTaskId);
      }
      if (e.key === "Escape") setSelectedLinkId(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedLinkId, allLinks]);

  // Handle drag-to-reorder within a sprint column
  const handleReorderDragStart = useCallback((sprintId: string, taskId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const data = sprintData.get(sprintId);
    if (!data) return;
    const originalIndex = data.sprintTasks.findIndex((st) => st.taskId === taskId);
    if (originalIndex < 0) return;

    const startY = e.clientY;
    setReorderDrag({ sprintId, taskId, startY, currentY: startY, originalIndex });
    setReorderPreview(new Map());

    const handleMouseMove = (ev: MouseEvent) => {
      setReorderDrag((prev) => prev ? { ...prev, currentY: ev.clientY } : null);
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);

      setReorderDrag((prev) => {
        if (!prev) return null;
        // Apply the reorder
        const data = sprintData.get(prev.sprintId);
        if (data) {
          const tasks = [...data.sprintTasks];
          const dy = prev.currentY - prev.startY;
          const cardHeight = 36; // approximate card height + gap
          const offset = Math.round(dy / cardHeight);
          const newIndex = Math.max(0, Math.min(tasks.length - 1, prev.originalIndex + offset));

          if (newIndex !== prev.originalIndex) {
            const [moved] = tasks.splice(prev.originalIndex, 1);
            tasks.splice(newIndex, 0, moved);

            // Mark as manually ordered
            hasManualOrder.current.add(prev.sprintId);

            // Update local state
            setSprintData((old) => {
              const updated = new Map(old);
              const sprintFull = updated.get(prev.sprintId);
              if (sprintFull) {
                updated.set(prev.sprintId, { ...sprintFull, sprintTasks: tasks });
              }
              return updated;
            });

            // Persist to API
            const reorderItems = tasks.map((st, i) => ({ id: st.id, order: i }));
            api.reorder(reorderItems, "sprintTask").catch((err) => {
              setError(err instanceof Error ? err.message : "Failed to reorder");
            });
          }
        }
        return null;
      });
      setReorderPreview(new Map());
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [sprintData]);

  // Compute reorder preview (which index the card would land at)
  const getReorderedTasks = useCallback((sprintId: string): SprintTask[] => {
    if (!reorderDrag || reorderDrag.sprintId !== sprintId) {
      return sprintData.get(sprintId)?.sprintTasks || [];
    }
    const data = sprintData.get(sprintId);
    if (!data) return [];

    const tasks = [...data.sprintTasks];
    const dy = reorderDrag.currentY - reorderDrag.startY;
    const cardHeight = 36;
    const offset = Math.round(dy / cardHeight);
    const newIndex = Math.max(0, Math.min(tasks.length - 1, reorderDrag.originalIndex + offset));

    if (newIndex !== reorderDrag.originalIndex) {
      const [moved] = tasks.splice(reorderDrag.originalIndex, 1);
      tasks.splice(newIndex, 0, moved);
    }
    return tasks;
  }, [reorderDrag, sprintData]);

  // Total scrollable dimensions
  const totalWidth = sprints.length * COL_STRIDE + 40;
  const totalHeight = Math.max(600, ...sprints.map((s) => {
    const data = sprintData.get(s.id);
    return data ? data.sprintTasks.length * 52 + 120 : 600;
  }));

  if (loading) {
    return <div className="flex items-center justify-center h-full text-gray-400">Loading sprints…</div>;
  }

  if (sprints.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        <p className="text-sm">No sprints found. Create a sprint from the board view first.</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="h-full overflow-auto relative bg-gray-50" onClick={() => { setSelectedLinkId(null); onDeselectTask?.(); }}>
      {/* Error banner */}
      {error && (
        <div className="sticky top-0 z-50 bg-red-50 border-b border-red-200 px-4 py-2 text-sm text-red-700 flex items-center gap-2">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {/* SVG overlay for link lines + sibling lines */}
      <svg
        className="absolute inset-0"
        width={totalWidth}
        height={totalHeight}
        style={{ overflow: "visible", zIndex: 5, pointerEvents: "none" }}
        onClick={() => setSelectedLinkId(null)}
      >
        <defs>
          <marker id="link-arrow-green" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="#10b981" />
          </marker>
          <marker id="link-arrow-amber" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="#f59e0b" />
          </marker>
        </defs>

        {/* Explicit task links */}
        {linePositions.map((lp) => {
          const color = LINK_TYPE_COLORS[lp.linkType] || "#94a3b8";
          const isRelated = lp.linkType === "RELATED";
          const isSelected = selectedLinkId === lp.id;
          let curvePath: string;
          if (lp.sameColumn) {
            // Same-column: loop out to the right with a compact arc
            const bulge = 20 + Math.abs(lp.y2 - lp.y1) * 0.15;
            const cx = lp.x1 + bulge;
            curvePath = `M ${lp.x1} ${lp.y1} C ${cx} ${lp.y1}, ${cx} ${lp.y2}, ${lp.x2} ${lp.y2}`;
          } else {
            // Cross-column: flatter S-curve (control points at ~25% from each edge)
            const gap = lp.x2 - lp.x1;
            const cp1x = lp.x1 + gap * 0.25;
            const cp2x = lp.x2 - gap * 0.25;
            curvePath = `M ${lp.x1} ${lp.y1} C ${cp1x} ${lp.y1}, ${cp2x} ${lp.y2}, ${lp.x2} ${lp.y2}`;
          }
          return (
            <g key={lp.id} style={{ pointerEvents: "auto", cursor: "pointer" }}>
              {/* Wide invisible hit area for easy clicking */}
              <path
                d={curvePath}
                fill="none"
                stroke="transparent"
                strokeWidth={14}
                onClick={(e) => { e.stopPropagation(); setSelectedLinkId(lp.id); }}
              />
              {/* Visible line */}
              <path
                d={curvePath}
                fill="none"
                stroke={isSelected ? "#ef4444" : color}
                strokeWidth={isSelected ? 3 : 2}
                strokeOpacity={isSelected ? 1 : 0.7}
                markerEnd={isRelated ? undefined : "url(#link-arrow-green)"}
                onClick={(e) => { e.stopPropagation(); setSelectedLinkId(lp.id); }}
              />
              {/* Delete hint on selected */}
              {isSelected && (
                <text
                  x={(lp.x1 + lp.x2) / 2}
                  y={Math.min(lp.y1, lp.y2) - 8}
                  textAnchor="middle"
                  className="text-[10px] fill-red-500 select-none"
                  style={{ pointerEvents: "none" }}
                >
                  Press Delete to remove
                </text>
              )}
            </g>
          );
        })}

        {/* Sibling (parent-child) lines within sprint */}
        {siblingLines.map((sl) => (
          <line
            key={sl.key}
            x1={sl.x1}
            y1={sl.y1}
            x2={sl.x2}
            y2={sl.y2}
            stroke={SIBLING_COLOR}
            strokeWidth={1.5}
            strokeDasharray="4 3"
            strokeOpacity={0.5}
          />
        ))}

        {/* Active drag line */}
        {dragLine && (
          <line
            x1={dragLine.x1}
            y1={dragLine.y1}
            x2={dragLine.x2}
            y2={dragLine.y2}
            stroke="#6366f1"
            strokeWidth={2}
            strokeDasharray="6 4"
            strokeOpacity={0.8}
          />
        )}
      </svg>

      {/* Sprint columns with gap */}
      <div className="flex min-h-full px-4 pt-1" style={{ minWidth: totalWidth, gap: COL_GAP }}>
        {sprints.map((sprint) => {
          const tasks = getReorderedTasks(sprint.id);
          const isActive = sprint.status === "active";
          const isClosed = sprint.status === "closed";

          return (
            <div
              key={sprint.id}
              className="flex-shrink-0 flex flex-col rounded-lg border border-gray-200 bg-white overflow-hidden"
              style={{ width: COL_WIDTH }}
            >
              {/* Sprint header */}
              <div className={`px-3 py-2 border-b ${isClosed ? "bg-gray-100 border-gray-200" : isActive ? "bg-indigo-50 border-indigo-200" : "bg-white border-gray-200"}`}>
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-semibold ${isClosed ? "text-gray-400" : "text-gray-800"}`}>
                    Sprint {sprint.number}
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                    isClosed ? "bg-gray-200 text-gray-500"
                    : isActive ? "bg-indigo-100 text-indigo-700"
                    : "bg-gray-100 text-gray-500"
                  }`}>
                    {sprint.status}
                  </span>
                  <span className="text-[10px] text-gray-400 ml-auto">{tasks.length} tasks</span>
                </div>
              </div>

              {/* Task cards */}
              <div className="flex-1 p-2 space-y-1">
                {tasks.map((st) => (
                  <TaskCard
                    key={st.id}
                    sprintTask={st}
                    ref={(el) => {
                      if (el) cardRefs.current.set(st.taskId, el);
                      else cardRefs.current.delete(st.taskId);
                    }}
                    isDragFrom={dragFrom === st.taskId}
                    isDragTo={dragTo === st.taskId}
                    isSelected={selectedTaskId === st.taskId}
                    isDragging={reorderDrag?.taskId === st.taskId}
                    onDragStart={(e) => handleDragStart(st.taskId, e)}
                    onReorderDragStart={(e) => handleReorderDragStart(sprint.id, st.taskId, e)}
                    onClick={() => {
                      if (selectedTaskId === st.taskId) {
                        onDeselectTask?.();
                      } else {
                        onSelectTask?.(st.taskId);
                      }
                    }}
                    hasLinks={allLinks.some((l) => l.fromTaskId === st.taskId || l.toTaskId === st.taskId)}
                    linkCount={allLinks.filter((l) => l.fromTaskId === st.taskId || l.toTaskId === st.taskId).length}
                    hasParent={siblingPairs.some((p) => p.childTaskId === st.taskId)}
                  />
                ))}
                {tasks.length === 0 && (
                  <div className="text-xs text-gray-300 text-center py-4">No tasks</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Link type selection menu (only for same-sprint links) */}
      {linkTypeMenu && (
        <div
          className="fixed inset-0 z-50"
          onClick={() => setLinkTypeMenu(null)}
        >
          <div
            className="fixed bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-50"
            style={{ left: linkTypeMenu.x - 60, top: linkTypeMenu.y + 10 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-1 text-[10px] text-gray-400 font-medium">Create link (same sprint)</div>
            {Object.entries(LINK_TYPE_LABELS).map(([type, label]) => (
              <button
                key={type}
                onClick={() => handleCreateLink(linkTypeMenu.fromId, linkTypeMenu.toId, type)}
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-indigo-50 transition-colors flex items-center gap-2"
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: LINK_TYPE_COLORS[type] }} />
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="fixed bottom-4 right-4 bg-white/90 backdrop-blur rounded-lg shadow border border-gray-200 px-3 py-2 z-30">
        <div className="text-[10px] text-gray-400 font-medium mb-1">●&thinsp;Drag to link &nbsp;⠿&thinsp;Drag to reorder</div>
        <div className="flex items-center gap-3">
          {Object.entries(LINK_TYPE_LABELS).map(([type, label]) => (
            <div key={type} className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: LINK_TYPE_COLORS[type] }} />
              <span className="text-[10px] text-gray-500">{label}</span>
            </div>
          ))}
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: SIBLING_COLOR }} />
            <span className="text-[10px] text-gray-500">Parent–child</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Task Card component with drag handle
const TaskCard = React.forwardRef<
  HTMLDivElement,
  {
    sprintTask: SprintTask;
    isDragFrom: boolean;
    isDragTo: boolean;
    isSelected: boolean;
    isDragging: boolean;
    onDragStart: (e: React.MouseEvent) => void;
    onReorderDragStart: (e: React.MouseEvent) => void;
    onClick: () => void;
    hasLinks: boolean;
    linkCount: number;
    hasParent: boolean;
  }
>(function TaskCard({ sprintTask, isDragFrom, isDragTo, isSelected, isDragging, onDragStart, onReorderDragStart, onClick, hasLinks, linkCount, hasParent }, ref) {
  const task = sprintTask.task;

  return (
    <div
      ref={ref}
      data-task-id={sprintTask.taskId}
      className={`
        group relative flex items-center gap-1.5 px-2 py-1.5 rounded-md text-sm cursor-pointer transition-all
        ${isDragTo ? "ring-2 ring-indigo-400 bg-indigo-50" : ""}
        ${isDragFrom ? "opacity-50 ring-2 ring-indigo-300" : ""}
        ${isSelected ? "ring-2 ring-indigo-500 bg-indigo-50" : ""}
        ${isDragging ? "opacity-60 shadow-lg ring-2 ring-gray-400" : ""}
        ${task.completed ? "bg-gray-50 text-gray-400" : task.inProgress ? "bg-amber-50/50" : "bg-white"}
        border ${hasLinks ? "border-indigo-200" : "border-gray-150"}
        hover:border-indigo-300 hover:shadow-sm
      `}
    >
      {/* Drag handle — left edge (link) */}
      <div
        onMouseDown={onDragStart}
        className="absolute -left-2.5 top-1/2 -translate-y-1/2 w-5 h-8 flex items-center justify-center cursor-crosshair opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ zIndex: 30 }}
        title="Drag to another task to create a link"
      >
        <div className="w-2.5 h-2.5 rounded-full bg-indigo-400 ring-2 ring-white shadow-sm" />
      </div>

      {/* Drag handle — right edge (link) */}
      <div
        onMouseDown={onDragStart}
        className="absolute -right-2.5 top-1/2 -translate-y-1/2 w-5 h-8 flex items-center justify-center cursor-crosshair opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ zIndex: 30 }}
        title="Drag to another task to create a link"
      >
        <div className="w-2.5 h-2.5 rounded-full bg-indigo-400 ring-2 ring-white shadow-sm" />
      </div>

      {/* Reorder drag handle — grip dots */}
      <div
        onMouseDown={onReorderDragStart}
        className="flex-shrink-0 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity text-gray-400"
        title="Drag to reorder"
      >
        <svg className="w-3 h-3" viewBox="0 0 6 10" fill="currentColor">
          <circle cx="1" cy="1" r="1" /><circle cx="5" cy="1" r="1" />
          <circle cx="1" cy="5" r="1" /><circle cx="5" cy="5" r="1" />
          <circle cx="1" cy="9" r="1" /><circle cx="5" cy="9" r="1" />
        </svg>
      </div>

      {/* Parent-child indicator */}
      {hasParent && (
        <span className="w-1 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: SIBLING_COLOR, opacity: 0.5 }} />
      )}

      {/* Status indicator */}
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
        task.completed ? "bg-green-500" : task.inProgress ? "bg-amber-400" : "border border-gray-300"
      }`} />

      {/* Task title */}
      <button
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        className="text-left truncate flex-1 hover:text-indigo-600 transition-colors text-xs"
      >
        {task.title}
      </button>

      {/* Link indicator */}
      {hasLinks && (
        <span className="text-[9px] px-1 py-0.5 rounded bg-indigo-100 text-indigo-600 font-medium flex-shrink-0" title={`${linkCount} link${linkCount > 1 ? "s" : ""}`}>
          🔗
        </span>
      )}
    </div>
  );
});
