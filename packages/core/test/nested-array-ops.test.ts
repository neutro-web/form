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
      expect(state.errors['cube.0.2.0']).toBeUndefined();
      expect(state.errors['cube.1.0.0']).toBe('sibling');
      expect(state.touched['cube.1.0.0']).toBe(true);
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
      expect(state.errors['cube.0.0.3']).toBeUndefined();
      expect(state.errors['cube.0.1.0']).toBe('sibling-middle');
      expect(state.errors['cube.1.0.0']).toBe('sibling-outer');
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
      expect(state.values.cube[2][0][0]).toBe(9001);
      expect(state.errors['cube.0.0.0']).toBe('errB');
      expect(state.values.cube[0][0][0]).toBe(9002);
      expect(state.errors['cube.1.0.0']).toBe('errC');
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
      expect(state.errors['cube.0.0.0']).toBe('errB');
      expect(state.errors['cube.0.1.0']).toBe('errC');
      expect(state.errors['cube.1.0.0']).toBe('errD');
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
      expect(state.errors['cube.0.0.0']).toBe('errB');
      expect(state.errors['cube.0.0.1']).toBe('errC');
      expect(state.errors['cube.0.0.2']).toBe('errD');
      expect(state.errors['cube.0.1.0']).toBe('errE');
      expect(state.errors['cube.1.0.0']).toBe('errF');
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
      expect(state.errors['cube.1.0.0']).toBe('errA');
      expect(state.errors['cube.2.0.0']).toBe('errC');
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
      expect(state.errors['cube.0.2.0']).toBe('errA');
      expect(state.errors['cube.0.1.0']).toBe('errC');
      expect(state.errors['cube.1.0.0']).toBe('errD');
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
      expect(state.errors['cube.0.0.3']).toBe('errA');
      expect(state.errors['cube.0.0.1']).toBe('errC');
      expect(state.errors['cube.0.1.0']).toBe('errD');
      expect(state.errors['cube.1.0.0']).toBe('errE');
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
      expect(state.errors['cube.2.0.0']).toBe('errB');
      expect(state.errors['cube.3.0.0']).toBe('errC');
      expect(state.errors['cube.1.0.0']).toBeUndefined();
      expect(state.touched['cube.1.0.0']).toBeUndefined();
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
      expect(state.errors['cube.0.2.0']).toBe('errB');
      expect(state.errors['cube.0.3.0']).toBe('errC');
      expect(state.errors['cube.1.0.0']).toBe('errD');
      expect(state.errors['cube.0.1.0']).toBeUndefined();
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
      expect(state.errors['cube.0.0.2']).toBe('errB');
      expect(state.errors['cube.0.0.3']).toBe('errC');
      expect(state.errors['cube.0.0.4']).toBe('errD');
      expect(state.errors['cube.0.1.0']).toBe('errE');
      expect(state.errors['cube.1.0.0']).toBe('errF');
      expect(state.errors['cube.0.0.1']).toBeUndefined();
      expect(state.values.cube[0][0][1]).toBe(9999);
    });
  });
});
