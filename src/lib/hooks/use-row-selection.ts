"use client";

import { useCallback, useMemo, useState } from "react";

/**
 * Row multi-select state for tables/lists that support batch actions.
 *
 * `allIds` is the full set of currently-rendered selectable ids. Selection is
 * automatically pruned to ids that still exist, so a `router.refresh()` (or a
 * batch delete) that drops rows never leaves stale ids selected. Works with
 * string ids (most lists) or number ids (e.g. live WordPress/Shopify post ids).
 */
export function useRowSelection<Id extends string | number>(allIds: Id[]) {
  const [selected, setSelected] = useState<Set<Id>>(() => new Set());

  const present = useMemo(() => new Set(allIds), [allIds]);

  // Selected ids that are still in the current list, in list order.
  const ids = useMemo(
    () => allIds.filter((id) => selected.has(id)),
    [allIds, selected],
  );

  const toggle = useCallback((id: Id, on?: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on ?? !next.has(id)) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(
    (on: boolean) => setSelected(on ? new Set(present) : new Set<Id>()),
    [present],
  );

  const clear = useCallback(() => setSelected(new Set<Id>()), []);

  const isSelected = useCallback((id: Id) => selected.has(id), [selected]);

  const count = ids.length;

  return {
    /** Selected ids that still exist, in render order. */
    ids,
    isSelected,
    toggle,
    toggleAll,
    clear,
    count,
    allSelected: allIds.length > 0 && count === allIds.length,
    someSelected: count > 0 && count < allIds.length,
  };
}
