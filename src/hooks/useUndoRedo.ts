"use client";

import { useState, useRef, useCallback } from "react";

export interface UndoAction {
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

const MAX_STACK_SIZE = 50;

export function useUndoRedo(onAfterAction: () => void) {
  const undoStackRef = useRef<UndoAction[]>([]);
  const redoStackRef = useRef<UndoAction[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const afterRef = useRef(onAfterAction);
  afterRef.current = onAfterAction;

  const sync = useCallback(() => {
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(redoStackRef.current.length > 0);
  }, []);

  const pushAction = useCallback((action: UndoAction) => {
    undoStackRef.current.push(action);
    if (undoStackRef.current.length > MAX_STACK_SIZE) undoStackRef.current.shift();
    redoStackRef.current = [];
    sync();
  }, [sync]);

  const undo = useCallback(async () => {
    const action = undoStackRef.current.pop();
    if (!action) return;
    try { await action.undo(); } catch { /* best effort */ }
    redoStackRef.current.push(action);
    sync();
    afterRef.current();
  }, [sync]);

  const redo = useCallback(async () => {
    const action = redoStackRef.current.pop();
    if (!action) return;
    try { await action.redo(); } catch { /* best effort */ }
    undoStackRef.current.push(action);
    sync();
    afterRef.current();
  }, [sync]);

  const clear = useCallback(() => {
    undoStackRef.current = [];
    redoStackRef.current = [];
    sync();
  }, [sync]);

  return { pushAction, undo, redo, canUndo, canRedo, clear };
}
