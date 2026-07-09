/**
 * Array mutation operations (append/insert/remove/move/swap) plus their
 * shared internal re-indexing helpers.
 *
 * Extracted from `createForm`'s closure body (packages/core/src/index.ts) as
 * part of the modular-bundle-splitting effort. `attachArrayOps` is called
 * once, right after `createForm` constructs its `ctx` object, and returns
 * `arrayAppend`/`arrayInsert`/`arrayRemove`/`arrayMove`/`arraySwap` for the
 * caller to assign onto the form instance.
 *
 * `shiftStateIndices` and `rekeyArrayState` are internal helpers used only by
 * the array methods below — they are not part of the returned object.
 *
 * This is a pure relocation: the two-phase collect-then-delete-then-write
 * in-place mutation pattern (no `stateMap = updated` reassignment) that these
 * functions already use is preserved verbatim, as is `arrayAppend`'s direct
 * delegation to `ctx.setFieldValue` rather than reimplementing write +
 * validate + notify itself.
 */
import type { FormEngineContext } from '../engine.js';
import type { FormInstance, Path } from '../index.js';
import { getNestedValue, setNestedValue } from '../index.js';

/**
 * Applies a batch of `validatedPaths` renames using the delete-all-old-keys,
 * then add-all-new-keys discipline required to avoid a freshly-added key
 * being clobbered by a later delete in the same pass. Shared by
 * `rekeyArrayState` (move) and `arraySwap`. Not used by `shiftStateIndices`,
 * which computes and mutates `validatedPaths` inline during its scan rather
 * than staging a separate `[old, new][]` list.
 */
function applyValidatedRenames(
  ctx: FormEngineContext<any>,
  renames: Array<[string, string]>
): void {
  for (const [oldKey] of renames) {
    ctx.validatedPaths.delete(oldKey);
    ctx.unindexKey(oldKey);
  }
  for (const [, newKey] of renames) {
    ctx.validatedPaths.add(newKey);
    ctx.indexKey(newKey);
  }
}

export function attachArrayOps<T extends object>(
  ctx: FormEngineContext<T>
): Pick<
  FormInstance<T>,
  'arrayAppend' | 'arrayInsert' | 'arrayRemove' | 'arrayMove' | 'arraySwap'
> {
  const shiftStateIndices = (
    basePath: string,
    fromIndex: number,
    action: 'remove' | 'insert',
    targetIndex?: number
  ): string[] => {
    const shiftedKeys: string[] = [];
    const candidates = Array.from(ctx.pathIndex.get(basePath)?.keys() ?? []);
    // Two-phase per map: compute every drop/rename against the ORIGINAL stateMap
    // first, then delete every affected candidate key, and only after all deletes
    // have landed write the renamed ctx.values back in. Doing delete-and-write in a
    // single interleaved pass (in `candidates` iteration order) is unsafe: e.g.
    // removing index 0 from a 5-item array renames index 1's key down to index 0's
    // key while ALSO needing to drop the original index-0 key — if the candidate
    // order processes the rename before the drop, the drop (keyed only by string,
    // not by "was this a rename target") silently wipes out the just-renamed value.
    const shiftMap = (stateMap: Record<string, any>) => {
      const prefix = `${basePath}.`;
      const toDelete: string[] = [];
      const renames: Array<[string, string, any]> = [];
      for (const key of candidates) {
        if (!(key in stateMap)) continue;
        if (!key.startsWith(prefix)) continue;
        const remaining = key.substring(prefix.length);
        const match = remaining.match(/^(\d+)(.*)$/);
        if (!match) continue;
        const index = parseInt(match[1], 10);
        const tail = match[2];
        if (action === 'remove') {
          if (index === fromIndex) {
            toDelete.push(key);
            ctx.unindexKey(key);
          } else if (index > fromIndex) {
            toDelete.push(key);
            ctx.unindexKey(key);
            renames.push([key, `${prefix}${index - 1}${tail}`, stateMap[key]]);
          }
        } else if (action === 'insert' && targetIndex !== undefined) {
          if (index >= targetIndex) {
            toDelete.push(key);
            ctx.unindexKey(key);
            renames.push([key, `${prefix}${index + 1}${tail}`, stateMap[key]]);
          }
        }
      }
      // Value captured in the renames triple ABOVE, before any delete below — reading
      // stateMap[oldKey] after deletion would return undefined.
      for (const key of toDelete) delete stateMap[key];
      for (const [, newKey, value] of renames) {
        stateMap[newKey] = value;
        ctx.indexKey(newKey);
        shiftedKeys.push(newKey);
      }
    };
    ctx.batch(() => {
      shiftMap(ctx.errors);
      shiftMap(ctx.touched);
      shiftMap(ctx.dirty);
      shiftMap(ctx.wasSet);
      // Update ctx.validatedPaths for the structural change.
      // For insert: shift existing indices ≥ targetIndex up by 1 so tracking follows items.
      // For remove: drop the removed index, renumber survivors above it.
      const arrPrefix = `${basePath}.`;
      const validatedRenames: string[] = [];
      for (const key of candidates) {
        if (!ctx.validatedPaths.has(key)) continue;
        if (!key.startsWith(arrPrefix)) continue;
        const remaining = key.substring(arrPrefix.length);
        const match = remaining.match(/^(\d+)(.*)$/);
        if (!match) continue;
        const index = parseInt(match[1], 10);
        const tail = match[2];
        if (action === 'remove') {
          if (index === fromIndex) {
            ctx.validatedPaths.delete(key);
            ctx.unindexKey(key);
          } else if (index > fromIndex) {
            ctx.validatedPaths.delete(key);
            ctx.unindexKey(key);
            validatedRenames.push(`${arrPrefix}${index - 1}${tail}`);
          }
        } else if (action === 'insert' && targetIndex !== undefined) {
          if (index >= targetIndex) {
            ctx.validatedPaths.delete(key);
            ctx.unindexKey(key);
            validatedRenames.push(`${arrPrefix}${index + 1}${tail}`);
          }
        }
      }
      // Add renamed ctx.validatedPaths entries only after every drop/delete above has
      // landed — same collision hazard as shiftMap above (a rename target can
      // coincide with a key that's also being dropped this same pass).
      for (const newKey of validatedRenames) {
        ctx.validatedPaths.add(newKey);
        ctx.indexKey(newKey);
      }
      // Also ctx.notify any actively-registered subscriber path under this array index whose
      // slot content shifted, even when no error/ctx.touched/ctx.dirty/ctx.wasSet state exists there -
      // otherwise arrayRemove/arrayInsert would have no way to reach a per-item VALUE
      // subscriber except by falling back to notifying the whole array (which, since
      // ctx.notify() cascades to descendants, re-fires every unaffected sibling too, not just
      // the shifted items). Unlike the state maps above (which relocate data to a new key),
      // subscriptions are registered against a fixed slot path - by the time this runs,
      // `ctx.values` has already been mutated (splice happened before this call), so re-running
      // ctx.notify() on the *same* key re-reads the new content that shifted into that slot.
      // Note: ctx.pathSubscribers itself is NOT renamed here (subscriptions stay registered at
      // their original path — only the ctx.notify-list is computed), so no ctx.indexKey/ctx.unindexKey
      // calls are needed for this loop; it only reads ctx.pathSubscribers, never writes it.
      for (const key of candidates) {
        if (!ctx.pathSubscribers.has(key) || key === '*') continue;
        if (!key.startsWith(arrPrefix)) continue;
        const remaining = key.substring(arrPrefix.length);
        const match = remaining.match(/^(\d+)(.*)$/);
        if (!match) continue;
        const index = parseInt(match[1], 10);
        if (action === 'remove') {
          if (index >= fromIndex) shiftedKeys.push(key);
        } else if (action === 'insert' && targetIndex !== undefined) {
          if (index >= targetIndex) shiftedKeys.push(key);
        }
      }
    });
    return [...new Set(shiftedKeys)];
  };

  const rekeyArrayState = (basePath: string, fromIndex: number, toIndex: number) => {
    const prefix = `${basePath}.`;
    const candidates = Array.from(ctx.pathIndex.get(basePath)?.keys() ?? []);
    const computeNewIndex = (index: number): number => {
      if (index === fromIndex) return toIndex;
      if (fromIndex < toIndex && index > fromIndex && index <= toIndex) return index - 1;
      if (fromIndex > toIndex && index >= toIndex && index < fromIndex) return index + 1;
      return index;
    };
    // Two-phase, mirroring shiftStateIndices (Task 10): a sliding-window arrayMove
    // rename is a permutation over the affected indices, so a destination key for
    // one source can equal the source key of another rename processed later in the
    // SAME candidates iteration (Map order is insertion order, not ascending numeric
    // order). Interleaving delete-and-write in one pass over `candidates` risks a
    // later `delete updated[key]` wiping out a value an earlier iteration already
    // wrote to that same key as its rename target. Phase 1 computes every rename
    // against the pristine `stateMap` (never mutated mid-loop); phase 2 deletes all
    // affected source keys, then writes all renamed ctx.values - deletes-before-writes
    // guarantees a write can never be clobbered by a later delete of the same key.
    const shiftMap = (stateMap: Record<string, any>) => {
      const renames: Array<[string, string, any]> = [];
      for (const key of candidates) {
        if (!(key in stateMap)) continue;
        if (!key.startsWith(prefix)) continue;
        const remaining = key.substring(prefix.length);
        const match = remaining.match(/^(\d+)(.*)$/);
        if (!match) continue;
        const index = parseInt(match[1], 10);
        const tail = match[2];
        const newIndex = computeNewIndex(index);
        if (newIndex === index) continue; // untouched by this move, leave as-is
        renames.push([key, `${prefix}${newIndex}${tail}`, stateMap[key]]);
      }
      for (const [oldKey] of renames) {
        delete stateMap[oldKey];
        ctx.unindexKey(oldKey);
      }
      for (const [, newKey, value] of renames) {
        stateMap[newKey] = value;
        ctx.indexKey(newKey);
      }
    };
    ctx.batch(() => {
      shiftMap(ctx.errors);
      shiftMap(ctx.touched);
      shiftMap(ctx.dirty);
      shiftMap(ctx.wasSet);
      // Re-key ctx.validatedPaths (Set) with the same sliding-window logic and the same
      // delete-all-then-write-all discipline as shiftMap above.
      const validatedRenames: Array<[string, string]> = [];
      for (const key of candidates) {
        if (!ctx.validatedPaths.has(key)) continue;
        if (!key.startsWith(prefix)) continue;
        const remaining = key.substring(prefix.length);
        const match = remaining.match(/^(\d+)(.*)$/);
        if (!match) continue;
        const index = parseInt(match[1], 10);
        const tail = match[2];
        const newIndex = computeNewIndex(index);
        if (newIndex === index) continue;
        validatedRenames.push([key, `${prefix}${newIndex}${tail}`]);
      }
      applyValidatedRenames(ctx, validatedRenames);
    });
  };

  const arrayAppend = ((path: any, item: any) => {
    const targetPath = Array.isArray(path) ? path.join('.') : path;
    const arr = getNestedValue(ctx.values, targetPath) || [];
    if (!Array.isArray(arr)) return;
    ctx.setFieldValue(targetPath, [...arr, item]);
    ctx.dispatchAction({ type: 'ARRAY_APPEND', path: targetPath, item });
  }) as FormInstance<T>['arrayAppend'];

  const arrayInsert = ((path: any, index: number, item: any) => {
    const targetPath = Array.isArray(path) ? path.join('.') : path;
    const arr = getNestedValue(ctx.values, targetPath) || [];
    if (!Array.isArray(arr) || index < 0 || index > arr.length) return;
    const wasAlreadySet = targetPath in ctx.wasSet;
    ctx.wasSet[targetPath] = true;
    if (!wasAlreadySet) ctx.indexKey(targetPath);
    const copy = [...arr];
    copy.splice(index, 0, item);
    ctx.batch(() => {
      setNestedValue(ctx.values, targetPath, copy);
      const shifted = shiftStateIndices(targetPath, index, 'insert', index);
      for (const k of shifted) ctx.notify(k);
      ctx.notify(`${targetPath}.${index}`);
      // Belt-and-braces: also reach an array-root subscriber explicitly via the
      // exact-only path (skips the descendant scan, so unaffected siblings aren't
      // re-notified). In practice ctx.notify(`${targetPath}.${index}`) above already walks
      // 'targetPath' as an ancestor, but this makes the root-subscriber guarantee
      // independent of that incidental path shape — see arrayRemove for the case where
      // it isn't incidental.
      ctx.notify(targetPath, { exact: true });
    });
    ctx.runValidation([targetPath]);
    ctx.dispatchAction({ type: 'ARRAY_INSERT', path: targetPath, index, item });
  }) as FormInstance<T>['arrayInsert'];

  const arrayRemove = (path: Path<T> | string | string[], index: number) => {
    const targetPath = Array.isArray(path) ? path.join('.') : path;
    const arr = getNestedValue(ctx.values, targetPath) || [];
    if (!Array.isArray(arr) || index < 0 || index >= arr.length) return;
    const wasAlreadySet = targetPath in ctx.wasSet;
    ctx.wasSet[targetPath] = true;
    if (!wasAlreadySet) ctx.indexKey(targetPath);
    const copy = [...arr];
    copy.splice(index, 1);
    ctx.batch(() => {
      setNestedValue(ctx.values, targetPath, copy);
      const shifted = shiftStateIndices(targetPath, index, 'remove');
      for (const k of shifted) ctx.notify(k);
      // Always reach a subscriber registered on the array path itself (e.g.
      // ctx.subscribeToPath('items', cb)), regardless of whether anything shifted below
      // it. Uses the exact-only ctx.notify — NOT a plain ctx.notify(targetPath) — so it does
      // NOT trigger ctx.notifyPathSubscribers' descendant scan, which would re-fire every
      // unaffected sibling item's per-field subscriber under the array root.
      ctx.notify(targetPath, { exact: true });
    });
    ctx.runValidation([targetPath]);
    ctx.dispatchAction({ type: 'ARRAY_REMOVE', path: targetPath, index });
  };

  const arrayMove = (path: Path<T> | string | string[], fromIndex: number, toIndex: number) => {
    const targetPath = Array.isArray(path) ? path.join('.') : path;
    const arr = getNestedValue(ctx.values, targetPath) || [];
    if (
      !Array.isArray(arr) ||
      fromIndex < 0 ||
      fromIndex >= arr.length ||
      toIndex < 0 ||
      toIndex >= arr.length
    )
      return;
    const wasAlreadySet = targetPath in ctx.wasSet;
    ctx.wasSet[targetPath] = true;
    if (!wasAlreadySet) ctx.indexKey(targetPath);
    const copy = [...arr];
    const [movedItem] = copy.splice(fromIndex, 1);
    copy.splice(toIndex, 0, movedItem);
    ctx.batch(() => {
      setNestedValue(ctx.values, targetPath, copy);
      rekeyArrayState(targetPath, fromIndex, toIndex);
      const start = Math.min(fromIndex, toIndex);
      const end = Math.max(fromIndex, toIndex);
      for (let i = start; i <= end; i++) ctx.notify(`${targetPath}.${i}`);
    });
    ctx.runValidation([targetPath]);
    ctx.dispatchAction({ type: 'ARRAY_MOVE', path: targetPath, from: fromIndex, to: toIndex });
  };

  const arraySwap = (path: Path<T> | string | string[], indexA: number, indexB: number) => {
    const targetPath = Array.isArray(path) ? path.join('.') : path;
    const arr = getNestedValue(ctx.values, targetPath) || [];
    if (
      !Array.isArray(arr) ||
      indexA < 0 ||
      indexA >= arr.length ||
      indexB < 0 ||
      indexB >= arr.length
    )
      return;
    const wasAlreadySet = targetPath in ctx.wasSet;
    ctx.wasSet[targetPath] = true;
    if (!wasAlreadySet) ctx.indexKey(targetPath);
    const copy = [...arr];
    [copy[indexA], copy[indexB]] = [copy[indexB], copy[indexA]];
    ctx.batch(() => {
      setNestedValue(ctx.values, targetPath, copy);
      const candidates = Array.from(ctx.pathIndex.get(targetPath)?.keys() ?? []);
      const swapKeys = (stateMap: Record<string, any>) => {
        const prefix = `${targetPath}.`;
        const prefixA = `${prefix}${indexA}`;
        const prefixB = `${prefix}${indexB}`;
        // Two-phase, same discipline as shiftStateIndices/rekeyArrayState: capture
        // every write's value (read from the pristine stateMap) and every key slated
        // for deletion FIRST, then apply all deletes before any write. Interleaving
        // reads/writes/deletes directly on stateMap in a single pass would risk a
        // later key's read of e.g. stateMap[bKey] observing an earlier iteration's
        // write instead of the original value.
        const writes: Array<[string, any]> = [];
        const toDelete: string[] = [];
        for (const key of candidates) {
          if (!(key in stateMap)) continue;
          // Use exact-or-dot-child match to avoid "items.1" matching "items.10", "items.11", etc.
          const matchesA = key === prefixA || key.startsWith(`${prefixA}.`);
          const matchesB = key === prefixB || key.startsWith(`${prefixB}.`);
          if (matchesA) {
            const tail = key.substring(prefixA.length);
            const bKey = `${prefixB}${tail}`;
            writes.push([bKey, stateMap[key]]);
            if (stateMap[bKey] === undefined) {
              // bKey had no prior state here, so it's genuinely gaining a new
              // claim at this key while `key` (A-side) loses its claim.
              ctx.indexKey(bKey);
              toDelete.push(key);
              ctx.unindexKey(key);
            }
            // else: bKey already held state here — the key identity stays put
            // (only the ctx.values swap), so its existing claim is unchanged.
          } else if (matchesB) {
            const tail = key.substring(prefixB.length);
            const aKey = `${prefixA}${tail}`;
            writes.push([aKey, stateMap[key]]);
            if (stateMap[aKey] === undefined) {
              ctx.indexKey(aKey);
              toDelete.push(key);
              ctx.unindexKey(key);
            }
          }
        }
        for (const key of toDelete) delete stateMap[key];
        for (const [key, value] of writes) stateMap[key] = value;
      };
      swapKeys(ctx.errors);
      swapKeys(ctx.touched);
      swapKeys(ctx.dirty);
      swapKeys(ctx.wasSet);
      // Swap ctx.validatedPaths entries for indexA ↔ indexB.
      // Two-phase, mirroring shiftStateIndices/rekeyArrayState above: computing
      // renames against the pristine `candidates` snapshot and only deleting all
      // source keys before adding any rename target avoids a later `.add(newKey)`
      // being re-matched by `ctx.validatedPaths.has(key)` later in this SAME pass
      // (Set/Map iteration order is insertion order, not guaranteed to visit both
      // members of a swap pair "atomically") — which would silently swap it AGAIN.
      const prefixA = `${targetPath}.${indexA}`;
      const prefixB = `${targetPath}.${indexB}`;
      const validatedRenames: Array<[string, string]> = [];
      for (const key of candidates) {
        if (!ctx.validatedPaths.has(key)) continue;
        const matchesA = key === prefixA || key.startsWith(`${prefixA}.`);
        const matchesB = key === prefixB || key.startsWith(`${prefixB}.`);
        if (matchesA) {
          const tail = key.substring(prefixA.length);
          validatedRenames.push([key, `${prefixB}${tail}`]);
        } else if (matchesB) {
          const tail = key.substring(prefixB.length);
          validatedRenames.push([key, `${prefixA}${tail}`]);
        }
      }
      applyValidatedRenames(ctx, validatedRenames);
      ctx.notify(`${targetPath}.${indexA}`);
      ctx.notify(`${targetPath}.${indexB}`);
    });
    ctx.runValidation([targetPath]);
    ctx.dispatchAction({ type: 'ARRAY_SWAP', path: targetPath, i: indexA, j: indexB });
  };

  return { arrayAppend, arrayInsert, arrayRemove, arrayMove, arraySwap };
}
