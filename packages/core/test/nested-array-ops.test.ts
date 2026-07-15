import { describe, expect, it } from 'vitest';
import type { Path } from '../src/index.js';
import { createForm } from '../src/index.js';

type CubeShape = { cube: number[][][] };

function makeCube(): number[][][] {
  return Array.from({ length: 3 }, (_, i) =>
    Array.from({ length: 3 }, (_, j) => Array.from({ length: 4 }, (_, k) => i * 100 + j * 10 + k))
  );
}

function createCubeForm() {
  return createForm<CubeShape>({ initialValues: { cube: makeCube() } });
}

describe('nested-array-ops: cube (number[][][], raw array-of-arrays)', () => {
  describe('arrayRemove', () => {
    it('outer level: relocates state from cube.1.0.0 to cube.0.0.0 and removes the stale entry', () => {
      const form = createCubeForm();
      // Path<T> only type-checks raw (non-object-wrapped) array nesting one level deep --
      // 'cube.0.1' compiles but 'cube.0.1.2' doesn't (see the spec's Round-1 correction in
      // docs/superpowers/specs/2026-07-12-nested-array-correctness-benchmark-design.md).
      // These casts bypass that gap for the runtime-correctness assertions below, which is
      // the actual thing under test; the array-op calls themselves never need a cast.
      form.set('cube.1.0.0' as Path<CubeShape>, 999, { touch: true });
      form.setErrors({ 'cube.1.0.0': 'bad' } as Partial<Record<Path<CubeShape>, string>>);

      form.arrayRemove('cube', 0);

      const state = form.getState();
      expect(state.errors['cube.0.0.0']).toBe('bad');
      expect(state.touched['cube.0.0.0']).toBe(true);
      expect(state.dirty['cube.0.0.0']).toBe(true);
      expect(state.errors['cube.1.0.0']).toBeUndefined();
      expect(state.touched['cube.1.0.0']).toBeUndefined();
    });

    it('middle level: relocates state from cube.0.2.0 to cube.0.1.0 and leaves sibling outer element cube.1 undisturbed', () => {
      const form = createCubeForm();
      form.set('cube.0.2.0' as Path<CubeShape>, 999, { touch: true });
      form.setErrors({ 'cube.0.2.0': 'bad' } as Partial<Record<Path<CubeShape>, string>>);
      form.set('cube.1.0.0' as Path<CubeShape>, 555, { touch: true });
      form.setErrors({ 'cube.1.0.0': 'sibling' } as Partial<Record<Path<CubeShape>, string>>);

      form.arrayRemove('cube.0', 1);

      const state = form.getState();
      expect(state.errors['cube.0.1.0']).toBe('bad');
      expect(state.touched['cube.0.1.0']).toBe(true);
      expect(state.dirty['cube.0.1.0']).toBe(true);
      expect(state.errors['cube.0.2.0']).toBeUndefined();
      expect(state.touched['cube.0.2.0']).toBeUndefined();
      expect(state.errors['cube.1.0.0']).toBe('sibling');
      expect(state.touched['cube.1.0.0']).toBe(true);
      expect(state.dirty['cube.1.0.0']).toBe(true);
    });

    it('innermost level: relocates state from cube.0.0.3 to cube.0.0.2 and leaves sibling middle/outer elements undisturbed', () => {
      const form = createCubeForm();
      form.set('cube.0.0.3' as Path<CubeShape>, 999, { touch: true });
      form.setErrors({ 'cube.0.0.3': 'bad' } as Partial<Record<Path<CubeShape>, string>>);
      form.set('cube.0.1.0' as Path<CubeShape>, 777, { touch: true });
      form.setErrors({ 'cube.0.1.0': 'sibling-middle' } as Partial<
        Record<Path<CubeShape>, string>
      >);
      form.set('cube.1.0.0' as Path<CubeShape>, 555, { touch: true });
      form.setErrors({ 'cube.1.0.0': 'sibling-outer' } as Partial<Record<Path<CubeShape>, string>>);

      form.arrayRemove('cube.0.0', 2);

      const state = form.getState();
      expect(state.errors['cube.0.0.2']).toBe('bad');
      expect(state.touched['cube.0.0.2']).toBe(true);
      expect(state.dirty['cube.0.0.2']).toBe(true);
      expect(state.errors['cube.0.0.3']).toBeUndefined();
      expect(state.touched['cube.0.0.3']).toBeUndefined();
      expect(state.errors['cube.0.1.0']).toBe('sibling-middle');
      expect(state.touched['cube.0.1.0']).toBe(true);
      expect(state.errors['cube.1.0.0']).toBe('sibling-outer');
      expect(state.touched['cube.1.0.0']).toBe(true);
    });
  });

  describe('arrayMove', () => {
    it('outer level: cube.0->2, cube.1->0, cube.2->1 (move fromIndex 0 to toIndex 2)', () => {
      const form = createCubeForm();
      form.set('cube.0.0.0' as Path<CubeShape>, 9001, { touch: true });
      form.setErrors({ 'cube.0.0.0': 'errA' } as Partial<Record<Path<CubeShape>, string>>);
      form.set('cube.1.0.0' as Path<CubeShape>, 9002, { touch: true });
      form.setErrors({ 'cube.1.0.0': 'errB' } as Partial<Record<Path<CubeShape>, string>>);
      form.set('cube.2.0.0' as Path<CubeShape>, 9003, { touch: true });
      form.setErrors({ 'cube.2.0.0': 'errC' } as Partial<Record<Path<CubeShape>, string>>);

      form.arrayMove('cube', 0, 2);

      const state = form.getState();
      expect(state.errors['cube.2.0.0']).toBe('errA');
      expect(state.touched['cube.2.0.0']).toBe(true);
      expect(state.dirty['cube.2.0.0']).toBe(true);
      expect(state.values.cube[2][0][0]).toBe(9001);
      expect(state.errors['cube.0.0.0']).toBe('errB');
      expect(state.touched['cube.0.0.0']).toBe(true);
      expect(state.dirty['cube.0.0.0']).toBe(true);
      expect(state.values.cube[0][0][0]).toBe(9002);
      expect(state.errors['cube.1.0.0']).toBe('errC');
      expect(state.touched['cube.1.0.0']).toBe(true);
      expect(state.dirty['cube.1.0.0']).toBe(true);
      expect(state.values.cube[1][0][0]).toBe(9003);
    });

    it('middle level: cube.0.0->2, cube.0.1->0, cube.0.2->1, sibling outer cube.1 undisturbed', () => {
      const form = createCubeForm();
      form.set('cube.0.0.0' as Path<CubeShape>, 9001, { touch: true });
      form.setErrors({ 'cube.0.0.0': 'errA' } as Partial<Record<Path<CubeShape>, string>>);
      form.set('cube.0.1.0' as Path<CubeShape>, 9002, { touch: true });
      form.setErrors({ 'cube.0.1.0': 'errB' } as Partial<Record<Path<CubeShape>, string>>);
      form.set('cube.0.2.0' as Path<CubeShape>, 9003, { touch: true });
      form.setErrors({ 'cube.0.2.0': 'errC' } as Partial<Record<Path<CubeShape>, string>>);
      form.set('cube.1.0.0' as Path<CubeShape>, 9004, { touch: true });
      form.setErrors({ 'cube.1.0.0': 'errD' } as Partial<Record<Path<CubeShape>, string>>);

      form.arrayMove('cube.0', 0, 2);

      const state = form.getState();
      expect(state.errors['cube.0.2.0']).toBe('errA');
      expect(state.touched['cube.0.2.0']).toBe(true);
      expect(state.dirty['cube.0.2.0']).toBe(true);
      expect(state.errors['cube.0.0.0']).toBe('errB');
      expect(state.touched['cube.0.0.0']).toBe(true);
      expect(state.errors['cube.0.1.0']).toBe('errC');
      expect(state.touched['cube.0.1.0']).toBe(true);
      expect(state.errors['cube.1.0.0']).toBe('errD');
      expect(state.touched['cube.1.0.0']).toBe(true);
    });

    it('innermost level: cube.0.0.0->3, .1->0, .2->1, .3->2, sibling middle/outer undisturbed', () => {
      const form = createCubeForm();
      form.set('cube.0.0.0' as Path<CubeShape>, 9001, { touch: true });
      form.setErrors({ 'cube.0.0.0': 'errA' } as Partial<Record<Path<CubeShape>, string>>);
      form.set('cube.0.0.1' as Path<CubeShape>, 9002, { touch: true });
      form.setErrors({ 'cube.0.0.1': 'errB' } as Partial<Record<Path<CubeShape>, string>>);
      form.set('cube.0.0.2' as Path<CubeShape>, 9003, { touch: true });
      form.setErrors({ 'cube.0.0.2': 'errC' } as Partial<Record<Path<CubeShape>, string>>);
      form.set('cube.0.0.3' as Path<CubeShape>, 9004, { touch: true });
      form.setErrors({ 'cube.0.0.3': 'errD' } as Partial<Record<Path<CubeShape>, string>>);
      form.set('cube.0.1.0' as Path<CubeShape>, 9005, { touch: true });
      form.setErrors({ 'cube.0.1.0': 'errE' } as Partial<Record<Path<CubeShape>, string>>);
      form.set('cube.1.0.0' as Path<CubeShape>, 9006, { touch: true });
      form.setErrors({ 'cube.1.0.0': 'errF' } as Partial<Record<Path<CubeShape>, string>>);

      form.arrayMove('cube.0.0', 0, 3);

      const state = form.getState();
      expect(state.errors['cube.0.0.3']).toBe('errA');
      expect(state.touched['cube.0.0.3']).toBe(true);
      expect(state.dirty['cube.0.0.3']).toBe(true);
      expect(state.errors['cube.0.0.0']).toBe('errB');
      expect(state.touched['cube.0.0.0']).toBe(true);
      expect(state.errors['cube.0.0.1']).toBe('errC');
      expect(state.touched['cube.0.0.1']).toBe(true);
      expect(state.errors['cube.0.0.2']).toBe('errD');
      expect(state.touched['cube.0.0.2']).toBe(true);
      expect(state.errors['cube.0.1.0']).toBe('errE');
      expect(state.touched['cube.0.1.0']).toBe(true);
      expect(state.errors['cube.1.0.0']).toBe('errF');
      expect(state.touched['cube.1.0.0']).toBe(true);
    });
  });

  describe('arraySwap', () => {
    it('outer level: swaps cube.0 and cube.1, leaves cube.2 untouched', () => {
      const form = createCubeForm();
      form.set('cube.0.0.0' as Path<CubeShape>, 9001, { touch: true });
      form.setErrors({ 'cube.0.0.0': 'errA' } as Partial<Record<Path<CubeShape>, string>>);
      form.set('cube.1.0.0' as Path<CubeShape>, 9002, { touch: true });
      form.setErrors({ 'cube.1.0.0': 'errB' } as Partial<Record<Path<CubeShape>, string>>);
      form.set('cube.2.0.0' as Path<CubeShape>, 9003, { touch: true });
      form.setErrors({ 'cube.2.0.0': 'errC' } as Partial<Record<Path<CubeShape>, string>>);

      form.arraySwap('cube', 0, 1);

      const state = form.getState();
      expect(state.errors['cube.0.0.0']).toBe('errB');
      expect(state.touched['cube.0.0.0']).toBe(true);
      expect(state.dirty['cube.0.0.0']).toBe(true);
      expect(state.errors['cube.1.0.0']).toBe('errA');
      expect(state.touched['cube.1.0.0']).toBe(true);
      expect(state.dirty['cube.1.0.0']).toBe(true);
      expect(state.errors['cube.2.0.0']).toBe('errC');
      expect(state.touched['cube.2.0.0']).toBe(true);
    });

    it('middle level: swaps cube.0.0 and cube.0.2, leaves cube.0.1 and cube.1 untouched', () => {
      const form = createCubeForm();
      form.set('cube.0.0.0' as Path<CubeShape>, 9001, { touch: true });
      form.setErrors({ 'cube.0.0.0': 'errA' } as Partial<Record<Path<CubeShape>, string>>);
      form.set('cube.0.2.0' as Path<CubeShape>, 9002, { touch: true });
      form.setErrors({ 'cube.0.2.0': 'errB' } as Partial<Record<Path<CubeShape>, string>>);
      form.set('cube.0.1.0' as Path<CubeShape>, 9003, { touch: true });
      form.setErrors({ 'cube.0.1.0': 'errC' } as Partial<Record<Path<CubeShape>, string>>);
      form.set('cube.1.0.0' as Path<CubeShape>, 9004, { touch: true });
      form.setErrors({ 'cube.1.0.0': 'errD' } as Partial<Record<Path<CubeShape>, string>>);

      form.arraySwap('cube.0', 0, 2);

      const state = form.getState();
      expect(state.errors['cube.0.0.0']).toBe('errB');
      expect(state.touched['cube.0.0.0']).toBe(true);
      expect(state.errors['cube.0.2.0']).toBe('errA');
      expect(state.touched['cube.0.2.0']).toBe(true);
      expect(state.errors['cube.0.1.0']).toBe('errC');
      expect(state.touched['cube.0.1.0']).toBe(true);
      expect(state.errors['cube.1.0.0']).toBe('errD');
      expect(state.touched['cube.1.0.0']).toBe(true);
    });

    it('innermost level: swaps cube.0.0.0 and cube.0.0.3, leaves cube.0.0.1, cube.0.1.0, cube.1.0.0 untouched', () => {
      const form = createCubeForm();
      form.set('cube.0.0.0' as Path<CubeShape>, 9001, { touch: true });
      form.setErrors({ 'cube.0.0.0': 'errA' } as Partial<Record<Path<CubeShape>, string>>);
      form.set('cube.0.0.3' as Path<CubeShape>, 9002, { touch: true });
      form.setErrors({ 'cube.0.0.3': 'errB' } as Partial<Record<Path<CubeShape>, string>>);
      form.set('cube.0.0.1' as Path<CubeShape>, 9003, { touch: true });
      form.setErrors({ 'cube.0.0.1': 'errC' } as Partial<Record<Path<CubeShape>, string>>);
      form.set('cube.0.1.0' as Path<CubeShape>, 9004, { touch: true });
      form.setErrors({ 'cube.0.1.0': 'errD' } as Partial<Record<Path<CubeShape>, string>>);
      form.set('cube.1.0.0' as Path<CubeShape>, 9005, { touch: true });
      form.setErrors({ 'cube.1.0.0': 'errE' } as Partial<Record<Path<CubeShape>, string>>);

      form.arraySwap('cube.0.0', 0, 3);

      const state = form.getState();
      expect(state.errors['cube.0.0.0']).toBe('errB');
      expect(state.touched['cube.0.0.0']).toBe(true);
      expect(state.errors['cube.0.0.3']).toBe('errA');
      expect(state.touched['cube.0.0.3']).toBe(true);
      expect(state.errors['cube.0.0.1']).toBe('errC');
      expect(state.touched['cube.0.0.1']).toBe(true);
      expect(state.errors['cube.0.1.0']).toBe('errD');
      expect(state.touched['cube.0.1.0']).toBe(true);
      expect(state.errors['cube.1.0.0']).toBe('errE');
      expect(state.touched['cube.1.0.0']).toBe(true);
    });

    it('outer level, asymmetric: swapping a populated slot with an empty one clears the vacated key', () => {
      const form = createCubeForm();
      form.set('cube.0.0.0' as Path<CubeShape>, 9001, { touch: true });
      form.setErrors({ 'cube.0.0.0': 'errA' } as Partial<Record<Path<CubeShape>, string>>);
      // cube.1 is left with no tracked state at all before the swap.

      form.arraySwap('cube', 0, 1);

      const state = form.getState();
      expect(state.errors['cube.1.0.0']).toBe('errA');
      expect(state.touched['cube.1.0.0']).toBe(true);
      expect(state.dirty['cube.1.0.0']).toBe(true);
      expect(state.errors['cube.0.0.0']).toBeUndefined();
      expect(state.touched['cube.0.0.0']).toBeUndefined();
      expect(state.dirty['cube.0.0.0']).toBeUndefined();
    });
  });

  describe('arrayInsert', () => {
    it('outer level: inserting at index 1 shifts cube.1->2, cube.2->3, leaves cube.0 untouched, new slot has no prior state', () => {
      const form = createCubeForm();
      form.set('cube.0.0.0' as Path<CubeShape>, 9001, { touch: true });
      form.setErrors({ 'cube.0.0.0': 'errA' } as Partial<Record<Path<CubeShape>, string>>);
      form.set('cube.1.0.0' as Path<CubeShape>, 9002, { touch: true });
      form.setErrors({ 'cube.1.0.0': 'errB' } as Partial<Record<Path<CubeShape>, string>>);
      form.set('cube.2.0.0' as Path<CubeShape>, 9003, { touch: true });
      form.setErrors({ 'cube.2.0.0': 'errC' } as Partial<Record<Path<CubeShape>, string>>);
      const newMiddle = Array.from({ length: 3 }, (_, j) =>
        Array.from({ length: 4 }, (_, k) => 9000 + j * 10 + k)
      );

      form.arrayInsert('cube', 1, newMiddle);

      const state = form.getState();
      expect(state.errors['cube.0.0.0']).toBe('errA');
      expect(state.touched['cube.0.0.0']).toBe(true);
      expect(state.errors['cube.2.0.0']).toBe('errB');
      expect(state.touched['cube.2.0.0']).toBe(true);
      expect(state.errors['cube.3.0.0']).toBe('errC');
      expect(state.touched['cube.3.0.0']).toBe(true);
      expect(state.errors['cube.1.0.0']).toBeUndefined();
      expect(state.touched['cube.1.0.0']).toBeUndefined();
      expect(state.dirty['cube.1.0.0']).toBeUndefined();
      expect(state.values.cube[1][0][0]).toBe(9000);
    });

    it('middle level: inserting at index 1 shifts cube.0.1->2, cube.0.2->3, leaves cube.0.0 and cube.1 untouched', () => {
      const form = createCubeForm();
      form.set('cube.0.0.0' as Path<CubeShape>, 9001, { touch: true });
      form.setErrors({ 'cube.0.0.0': 'errA' } as Partial<Record<Path<CubeShape>, string>>);
      form.set('cube.0.1.0' as Path<CubeShape>, 9002, { touch: true });
      form.setErrors({ 'cube.0.1.0': 'errB' } as Partial<Record<Path<CubeShape>, string>>);
      form.set('cube.0.2.0' as Path<CubeShape>, 9003, { touch: true });
      form.setErrors({ 'cube.0.2.0': 'errC' } as Partial<Record<Path<CubeShape>, string>>);
      form.set('cube.1.0.0' as Path<CubeShape>, 9004, { touch: true });
      form.setErrors({ 'cube.1.0.0': 'errD' } as Partial<Record<Path<CubeShape>, string>>);
      const newInner = Array.from({ length: 4 }, (_, k) => 9500 + k);

      form.arrayInsert('cube.0', 1, newInner);

      const state = form.getState();
      expect(state.errors['cube.0.0.0']).toBe('errA');
      expect(state.touched['cube.0.0.0']).toBe(true);
      expect(state.errors['cube.0.2.0']).toBe('errB');
      expect(state.touched['cube.0.2.0']).toBe(true);
      expect(state.errors['cube.0.3.0']).toBe('errC');
      expect(state.touched['cube.0.3.0']).toBe(true);
      expect(state.errors['cube.1.0.0']).toBe('errD');
      expect(state.touched['cube.1.0.0']).toBe(true);
      expect(state.errors['cube.0.1.0']).toBeUndefined();
      expect(state.touched['cube.0.1.0']).toBeUndefined();
      expect(state.dirty['cube.0.1.0']).toBeUndefined();
      expect(state.values.cube[0][1][0]).toBe(9500);
    });

    it('innermost level: inserting at index 1 shifts cube.0.0.1->2, .2->3, .3->4, leaves cube.0.0.0, cube.0.1.0, cube.1.0.0 untouched', () => {
      const form = createCubeForm();
      form.set('cube.0.0.0' as Path<CubeShape>, 9001, { touch: true });
      form.setErrors({ 'cube.0.0.0': 'errA' } as Partial<Record<Path<CubeShape>, string>>);
      form.set('cube.0.0.1' as Path<CubeShape>, 9002, { touch: true });
      form.setErrors({ 'cube.0.0.1': 'errB' } as Partial<Record<Path<CubeShape>, string>>);
      form.set('cube.0.0.2' as Path<CubeShape>, 9003, { touch: true });
      form.setErrors({ 'cube.0.0.2': 'errC' } as Partial<Record<Path<CubeShape>, string>>);
      form.set('cube.0.0.3' as Path<CubeShape>, 9004, { touch: true });
      form.setErrors({ 'cube.0.0.3': 'errD' } as Partial<Record<Path<CubeShape>, string>>);
      form.set('cube.0.1.0' as Path<CubeShape>, 9005, { touch: true });
      form.setErrors({ 'cube.0.1.0': 'errE' } as Partial<Record<Path<CubeShape>, string>>);
      form.set('cube.1.0.0' as Path<CubeShape>, 9006, { touch: true });
      form.setErrors({ 'cube.1.0.0': 'errF' } as Partial<Record<Path<CubeShape>, string>>);

      form.arrayInsert('cube.0.0', 1, 9999);

      const state = form.getState();
      expect(state.errors['cube.0.0.0']).toBe('errA');
      expect(state.touched['cube.0.0.0']).toBe(true);
      expect(state.errors['cube.0.0.2']).toBe('errB');
      expect(state.touched['cube.0.0.2']).toBe(true);
      expect(state.errors['cube.0.0.3']).toBe('errC');
      expect(state.touched['cube.0.0.3']).toBe(true);
      expect(state.errors['cube.0.0.4']).toBe('errD');
      expect(state.touched['cube.0.0.4']).toBe(true);
      expect(state.errors['cube.0.1.0']).toBe('errE');
      expect(state.touched['cube.0.1.0']).toBe(true);
      expect(state.errors['cube.1.0.0']).toBe('errF');
      expect(state.touched['cube.1.0.0']).toBe(true);
      expect(state.errors['cube.0.0.1']).toBeUndefined();
      expect(state.touched['cube.0.0.1']).toBeUndefined();
      expect(state.dirty['cube.0.0.1']).toBeUndefined();
      expect(state.values.cube[0][0][1]).toBe(9999);
    });
  });
});

type GroupsShape = {
  groups: { items: { notes: string[] }[] }[];
};

function makeGroups(): GroupsShape['groups'] {
  return Array.from({ length: 3 }, (_, g) => ({
    items: Array.from({ length: 3 }, (_, i) => ({
      notes: Array.from({ length: 4 }, (_, n) => `g${g}-i${i}-n${n}`),
    })),
  }));
}

function createGroupsForm() {
  return createForm<GroupsShape>({ initialValues: { groups: makeGroups() } });
}

describe('nested-array-ops: groups (object-wrapped array nesting)', () => {
  describe('arrayRemove', () => {
    it('outer level: relocates state from groups.1.items.0.notes.0 to groups.0.items.0.notes.0', () => {
      const form = createGroupsForm();
      form.set('groups.1.items.0.notes.0', 'X', { touch: true });
      form.setErrors({ 'groups.1.items.0.notes.0': 'bad' });

      form.arrayRemove('groups', 0);

      const state = form.getState();
      expect(state.errors['groups.0.items.0.notes.0']).toBe('bad');
      expect(state.touched['groups.0.items.0.notes.0']).toBe(true);
      expect(state.dirty['groups.0.items.0.notes.0']).toBe(true);
      expect(state.errors['groups.1.items.0.notes.0']).toBeUndefined();
      expect(state.touched['groups.1.items.0.notes.0']).toBeUndefined();
    });

    it('middle level: relocates state from groups.0.items.2.notes.0 to groups.0.items.1.notes.0, leaves sibling group groups.1 undisturbed', () => {
      const form = createGroupsForm();
      form.set('groups.0.items.2.notes.0', 'X', { touch: true });
      form.setErrors({ 'groups.0.items.2.notes.0': 'bad' });
      form.set('groups.1.items.0.notes.0', 'Y', { touch: true });
      form.setErrors({ 'groups.1.items.0.notes.0': 'sibling' });

      form.arrayRemove('groups.0.items', 1);

      const state = form.getState();
      expect(state.errors['groups.0.items.1.notes.0']).toBe('bad');
      expect(state.touched['groups.0.items.1.notes.0']).toBe(true);
      expect(state.dirty['groups.0.items.1.notes.0']).toBe(true);
      expect(state.errors['groups.0.items.2.notes.0']).toBeUndefined();
      expect(state.touched['groups.0.items.2.notes.0']).toBeUndefined();
      expect(state.errors['groups.1.items.0.notes.0']).toBe('sibling');
      expect(state.touched['groups.1.items.0.notes.0']).toBe(true);
      expect(state.dirty['groups.1.items.0.notes.0']).toBe(true);
    });

    it('innermost level: relocates state from groups.0.items.1.notes.3 to groups.0.items.1.notes.2, leaves sibling item and sibling group undisturbed', () => {
      const form = createGroupsForm();
      form.set('groups.0.items.1.notes.3', 'X', { touch: true });
      form.setErrors({ 'groups.0.items.1.notes.3': 'bad' });
      form.set('groups.0.items.0.notes.0', 'Y', { touch: true });
      form.setErrors({ 'groups.0.items.0.notes.0': 'sibling-item' });
      form.set('groups.1.items.0.notes.0', 'Z', { touch: true });
      form.setErrors({ 'groups.1.items.0.notes.0': 'sibling-group' });

      form.arrayRemove('groups.0.items.1.notes', 2);

      const state = form.getState();
      expect(state.errors['groups.0.items.1.notes.2']).toBe('bad');
      expect(state.touched['groups.0.items.1.notes.2']).toBe(true);
      expect(state.dirty['groups.0.items.1.notes.2']).toBe(true);
      expect(state.errors['groups.0.items.1.notes.3']).toBeUndefined();
      expect(state.touched['groups.0.items.1.notes.3']).toBeUndefined();
      expect(state.errors['groups.0.items.0.notes.0']).toBe('sibling-item');
      expect(state.touched['groups.0.items.0.notes.0']).toBe(true);
      expect(state.errors['groups.1.items.0.notes.0']).toBe('sibling-group');
      expect(state.touched['groups.1.items.0.notes.0']).toBe(true);
    });
  });

  describe('arrayMove', () => {
    it('outer level: groups.0->2, groups.1->0, groups.2->1', () => {
      const form = createGroupsForm();
      form.set('groups.0.items.0.notes.0', 'A', { touch: true });
      form.setErrors({ 'groups.0.items.0.notes.0': 'errA' });
      form.set('groups.1.items.0.notes.0', 'B', { touch: true });
      form.setErrors({ 'groups.1.items.0.notes.0': 'errB' });
      form.set('groups.2.items.0.notes.0', 'C', { touch: true });
      form.setErrors({ 'groups.2.items.0.notes.0': 'errC' });

      form.arrayMove('groups', 0, 2);

      const state = form.getState();
      expect(state.errors['groups.2.items.0.notes.0']).toBe('errA');
      expect(state.touched['groups.2.items.0.notes.0']).toBe(true);
      expect(state.dirty['groups.2.items.0.notes.0']).toBe(true);
      expect(state.errors['groups.0.items.0.notes.0']).toBe('errB');
      expect(state.touched['groups.0.items.0.notes.0']).toBe(true);
      expect(state.errors['groups.1.items.0.notes.0']).toBe('errC');
      expect(state.touched['groups.1.items.0.notes.0']).toBe(true);
    });

    it('middle level: groups.0.items.0->2, .1->0, .2->1, sibling group groups.1 undisturbed', () => {
      const form = createGroupsForm();
      form.set('groups.0.items.0.notes.0', 'A', { touch: true });
      form.setErrors({ 'groups.0.items.0.notes.0': 'errA' });
      form.set('groups.0.items.1.notes.0', 'B', { touch: true });
      form.setErrors({ 'groups.0.items.1.notes.0': 'errB' });
      form.set('groups.0.items.2.notes.0', 'C', { touch: true });
      form.setErrors({ 'groups.0.items.2.notes.0': 'errC' });
      form.set('groups.1.items.0.notes.0', 'D', { touch: true });
      form.setErrors({ 'groups.1.items.0.notes.0': 'errD' });

      form.arrayMove('groups.0.items', 0, 2);

      const state = form.getState();
      expect(state.errors['groups.0.items.2.notes.0']).toBe('errA');
      expect(state.touched['groups.0.items.2.notes.0']).toBe(true);
      expect(state.errors['groups.0.items.0.notes.0']).toBe('errB');
      expect(state.touched['groups.0.items.0.notes.0']).toBe(true);
      expect(state.errors['groups.0.items.1.notes.0']).toBe('errC');
      expect(state.touched['groups.0.items.1.notes.0']).toBe(true);
      expect(state.errors['groups.1.items.0.notes.0']).toBe('errD');
      expect(state.touched['groups.1.items.0.notes.0']).toBe(true);
    });

    it('innermost level: groups.0.items.1.notes.0->3, .1->0, .2->1, .3->2, sibling item and sibling group undisturbed', () => {
      const form = createGroupsForm();
      form.set('groups.0.items.1.notes.0', 'A', { touch: true });
      form.setErrors({ 'groups.0.items.1.notes.0': 'errA' });
      form.set('groups.0.items.1.notes.1', 'B', { touch: true });
      form.setErrors({ 'groups.0.items.1.notes.1': 'errB' });
      form.set('groups.0.items.1.notes.2', 'C', { touch: true });
      form.setErrors({ 'groups.0.items.1.notes.2': 'errC' });
      form.set('groups.0.items.1.notes.3', 'D', { touch: true });
      form.setErrors({ 'groups.0.items.1.notes.3': 'errD' });
      form.set('groups.0.items.0.notes.0', 'E', { touch: true });
      form.setErrors({ 'groups.0.items.0.notes.0': 'errE' });
      form.set('groups.1.items.0.notes.0', 'F', { touch: true });
      form.setErrors({ 'groups.1.items.0.notes.0': 'errF' });

      form.arrayMove('groups.0.items.1.notes', 0, 3);

      const state = form.getState();
      expect(state.errors['groups.0.items.1.notes.3']).toBe('errA');
      expect(state.touched['groups.0.items.1.notes.3']).toBe(true);
      expect(state.errors['groups.0.items.1.notes.0']).toBe('errB');
      expect(state.touched['groups.0.items.1.notes.0']).toBe(true);
      expect(state.errors['groups.0.items.1.notes.1']).toBe('errC');
      expect(state.touched['groups.0.items.1.notes.1']).toBe(true);
      expect(state.errors['groups.0.items.1.notes.2']).toBe('errD');
      expect(state.touched['groups.0.items.1.notes.2']).toBe(true);
      expect(state.errors['groups.0.items.0.notes.0']).toBe('errE');
      expect(state.touched['groups.0.items.0.notes.0']).toBe(true);
      expect(state.errors['groups.1.items.0.notes.0']).toBe('errF');
      expect(state.touched['groups.1.items.0.notes.0']).toBe(true);
    });
  });

  describe('arraySwap', () => {
    it('outer level: swaps groups.0 and groups.1, leaves groups.2 untouched', () => {
      const form = createGroupsForm();
      form.set('groups.0.items.0.notes.0', 'A', { touch: true });
      form.setErrors({ 'groups.0.items.0.notes.0': 'errA' });
      form.set('groups.1.items.0.notes.0', 'B', { touch: true });
      form.setErrors({ 'groups.1.items.0.notes.0': 'errB' });
      form.set('groups.2.items.0.notes.0', 'C', { touch: true });
      form.setErrors({ 'groups.2.items.0.notes.0': 'errC' });

      form.arraySwap('groups', 0, 1);

      const state = form.getState();
      expect(state.errors['groups.0.items.0.notes.0']).toBe('errB');
      expect(state.touched['groups.0.items.0.notes.0']).toBe(true);
      expect(state.dirty['groups.0.items.0.notes.0']).toBe(true);
      expect(state.errors['groups.1.items.0.notes.0']).toBe('errA');
      expect(state.touched['groups.1.items.0.notes.0']).toBe(true);
      expect(state.dirty['groups.1.items.0.notes.0']).toBe(true);
      expect(state.errors['groups.2.items.0.notes.0']).toBe('errC');
      expect(state.touched['groups.2.items.0.notes.0']).toBe(true);
    });

    it('middle level: swaps groups.0.items.0 and groups.0.items.2, leaves groups.0.items.1 and groups.1 untouched', () => {
      const form = createGroupsForm();
      form.set('groups.0.items.0.notes.0', 'A', { touch: true });
      form.setErrors({ 'groups.0.items.0.notes.0': 'errA' });
      form.set('groups.0.items.2.notes.0', 'B', { touch: true });
      form.setErrors({ 'groups.0.items.2.notes.0': 'errB' });
      form.set('groups.0.items.1.notes.0', 'C', { touch: true });
      form.setErrors({ 'groups.0.items.1.notes.0': 'errC' });
      form.set('groups.1.items.0.notes.0', 'D', { touch: true });
      form.setErrors({ 'groups.1.items.0.notes.0': 'errD' });

      form.arraySwap('groups.0.items', 0, 2);

      const state = form.getState();
      expect(state.errors['groups.0.items.0.notes.0']).toBe('errB');
      expect(state.touched['groups.0.items.0.notes.0']).toBe(true);
      expect(state.errors['groups.0.items.2.notes.0']).toBe('errA');
      expect(state.touched['groups.0.items.2.notes.0']).toBe(true);
      expect(state.errors['groups.0.items.1.notes.0']).toBe('errC');
      expect(state.touched['groups.0.items.1.notes.0']).toBe(true);
      expect(state.errors['groups.1.items.0.notes.0']).toBe('errD');
      expect(state.touched['groups.1.items.0.notes.0']).toBe(true);
    });

    it('innermost level: swaps groups.0.items.1.notes.0 and .3, leaves .1, sibling item, sibling group untouched', () => {
      const form = createGroupsForm();
      form.set('groups.0.items.1.notes.0', 'A', { touch: true });
      form.setErrors({ 'groups.0.items.1.notes.0': 'errA' });
      form.set('groups.0.items.1.notes.3', 'B', { touch: true });
      form.setErrors({ 'groups.0.items.1.notes.3': 'errB' });
      form.set('groups.0.items.1.notes.1', 'C', { touch: true });
      form.setErrors({ 'groups.0.items.1.notes.1': 'errC' });
      form.set('groups.0.items.0.notes.0', 'D', { touch: true });
      form.setErrors({ 'groups.0.items.0.notes.0': 'errD' });
      form.set('groups.1.items.0.notes.0', 'E', { touch: true });
      form.setErrors({ 'groups.1.items.0.notes.0': 'errE' });

      form.arraySwap('groups.0.items.1.notes', 0, 3);

      const state = form.getState();
      expect(state.errors['groups.0.items.1.notes.0']).toBe('errB');
      expect(state.touched['groups.0.items.1.notes.0']).toBe(true);
      expect(state.errors['groups.0.items.1.notes.3']).toBe('errA');
      expect(state.touched['groups.0.items.1.notes.3']).toBe(true);
      expect(state.errors['groups.0.items.1.notes.1']).toBe('errC');
      expect(state.touched['groups.0.items.1.notes.1']).toBe(true);
      expect(state.errors['groups.0.items.0.notes.0']).toBe('errD');
      expect(state.touched['groups.0.items.0.notes.0']).toBe(true);
      expect(state.errors['groups.1.items.0.notes.0']).toBe('errE');
      expect(state.touched['groups.1.items.0.notes.0']).toBe(true);
    });

    it('outer level, asymmetric: swapping a populated slot with an empty one clears the vacated key', () => {
      const form = createGroupsForm();
      form.set('groups.0.items.0.notes.0', 'A', { touch: true });
      form.setErrors({ 'groups.0.items.0.notes.0': 'errA' });
      // groups.1 is left with no tracked state at all before the swap.

      form.arraySwap('groups', 0, 1);

      const state = form.getState();
      expect(state.errors['groups.1.items.0.notes.0']).toBe('errA');
      expect(state.touched['groups.1.items.0.notes.0']).toBe(true);
      expect(state.dirty['groups.1.items.0.notes.0']).toBe(true);
      expect(state.errors['groups.0.items.0.notes.0']).toBeUndefined();
      expect(state.touched['groups.0.items.0.notes.0']).toBeUndefined();
      expect(state.dirty['groups.0.items.0.notes.0']).toBeUndefined();
    });
  });

  describe('arrayInsert', () => {
    it('outer level: inserting at index 1 shifts groups.1->2, groups.2->3, leaves groups.0 untouched, new slot has no prior state', () => {
      const form = createGroupsForm();
      form.set('groups.0.items.0.notes.0', 'A', { touch: true });
      form.setErrors({ 'groups.0.items.0.notes.0': 'errA' });
      form.set('groups.1.items.0.notes.0', 'B', { touch: true });
      form.setErrors({ 'groups.1.items.0.notes.0': 'errB' });
      form.set('groups.2.items.0.notes.0', 'C', { touch: true });
      form.setErrors({ 'groups.2.items.0.notes.0': 'errC' });
      const newGroup: GroupsShape['groups'][number] = {
        items: Array.from({ length: 3 }, () => ({ notes: ['n0', 'n1', 'n2', 'n3'] })),
      };

      form.arrayInsert('groups', 1, newGroup);

      const state = form.getState();
      expect(state.errors['groups.0.items.0.notes.0']).toBe('errA');
      expect(state.touched['groups.0.items.0.notes.0']).toBe(true);
      expect(state.errors['groups.2.items.0.notes.0']).toBe('errB');
      expect(state.touched['groups.2.items.0.notes.0']).toBe(true);
      expect(state.errors['groups.3.items.0.notes.0']).toBe('errC');
      expect(state.touched['groups.3.items.0.notes.0']).toBe(true);
      expect(state.errors['groups.1.items.0.notes.0']).toBeUndefined();
      expect(state.touched['groups.1.items.0.notes.0']).toBeUndefined();
      expect(state.dirty['groups.1.items.0.notes.0']).toBeUndefined();
      expect(state.values.groups[1].items[0].notes[0]).toBe('n0');
    });

    it('middle level: inserting at index 1 shifts groups.0.items.1->2, .2->3, leaves groups.0.items.0 and groups.1 untouched', () => {
      const form = createGroupsForm();
      form.set('groups.0.items.0.notes.0', 'A', { touch: true });
      form.setErrors({ 'groups.0.items.0.notes.0': 'errA' });
      form.set('groups.0.items.1.notes.0', 'B', { touch: true });
      form.setErrors({ 'groups.0.items.1.notes.0': 'errB' });
      form.set('groups.0.items.2.notes.0', 'C', { touch: true });
      form.setErrors({ 'groups.0.items.2.notes.0': 'errC' });
      form.set('groups.1.items.0.notes.0', 'D', { touch: true });
      form.setErrors({ 'groups.1.items.0.notes.0': 'errD' });
      const newItem: GroupsShape['groups'][number]['items'][number] = {
        notes: ['a', 'b', 'c', 'd'],
      };

      form.arrayInsert('groups.0.items', 1, newItem);

      const state = form.getState();
      expect(state.errors['groups.0.items.0.notes.0']).toBe('errA');
      expect(state.touched['groups.0.items.0.notes.0']).toBe(true);
      expect(state.errors['groups.0.items.2.notes.0']).toBe('errB');
      expect(state.touched['groups.0.items.2.notes.0']).toBe(true);
      expect(state.errors['groups.0.items.3.notes.0']).toBe('errC');
      expect(state.touched['groups.0.items.3.notes.0']).toBe(true);
      expect(state.errors['groups.1.items.0.notes.0']).toBe('errD');
      expect(state.touched['groups.1.items.0.notes.0']).toBe(true);
      expect(state.errors['groups.0.items.1.notes.0']).toBeUndefined();
      expect(state.touched['groups.0.items.1.notes.0']).toBeUndefined();
      expect(state.dirty['groups.0.items.1.notes.0']).toBeUndefined();
      expect(state.values.groups[0].items[1].notes[0]).toBe('a');
    });

    it('innermost level: inserting at index 1 shifts groups.0.items.1.notes.1->2, .2->3, .3->4, leaves .0, sibling item, sibling group untouched', () => {
      const form = createGroupsForm();
      form.set('groups.0.items.1.notes.0', 'A', { touch: true });
      form.setErrors({ 'groups.0.items.1.notes.0': 'errA' });
      form.set('groups.0.items.1.notes.1', 'B', { touch: true });
      form.setErrors({ 'groups.0.items.1.notes.1': 'errB' });
      form.set('groups.0.items.1.notes.2', 'C', { touch: true });
      form.setErrors({ 'groups.0.items.1.notes.2': 'errC' });
      form.set('groups.0.items.1.notes.3', 'D', { touch: true });
      form.setErrors({ 'groups.0.items.1.notes.3': 'errD' });
      form.set('groups.0.items.0.notes.0', 'E', { touch: true });
      form.setErrors({ 'groups.0.items.0.notes.0': 'errE' });
      form.set('groups.1.items.0.notes.0', 'F', { touch: true });
      form.setErrors({ 'groups.1.items.0.notes.0': 'errF' });

      form.arrayInsert('groups.0.items.1.notes', 1, 'NEW');

      const state = form.getState();
      expect(state.errors['groups.0.items.1.notes.0']).toBe('errA');
      expect(state.touched['groups.0.items.1.notes.0']).toBe(true);
      expect(state.errors['groups.0.items.1.notes.2']).toBe('errB');
      expect(state.touched['groups.0.items.1.notes.2']).toBe(true);
      expect(state.errors['groups.0.items.1.notes.3']).toBe('errC');
      expect(state.touched['groups.0.items.1.notes.3']).toBe(true);
      expect(state.errors['groups.0.items.1.notes.4']).toBe('errD');
      expect(state.touched['groups.0.items.1.notes.4']).toBe(true);
      expect(state.errors['groups.0.items.0.notes.0']).toBe('errE');
      expect(state.touched['groups.0.items.0.notes.0']).toBe(true);
      expect(state.errors['groups.1.items.0.notes.0']).toBe('errF');
      expect(state.touched['groups.1.items.0.notes.0']).toBe(true);
      expect(state.errors['groups.0.items.1.notes.1']).toBeUndefined();
      expect(state.touched['groups.0.items.1.notes.1']).toBeUndefined();
      expect(state.dirty['groups.0.items.1.notes.1']).toBeUndefined();
      expect(state.values.groups[0].items[1].notes[1]).toBe('NEW');
    });
  });
});
