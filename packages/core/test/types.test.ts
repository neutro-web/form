import { describe, expectTypeOf, it } from 'vitest';
import { createForm, type ArrayItem, type GetPathValue, type Path, type SetOptions } from '../src/index';

interface SignupValues {
  email: string;
  age: number;
  items: Array<{ name: string; qty: number }>;
}

describe('Feature 1: Typed field paths', () => {
  it('Path<T> enumerates dot-notation strings', () => {
    type P = Path<SignupValues>;
    expectTypeOf<'email'>().toMatchTypeOf<P>();
    expectTypeOf<'age'>().toMatchTypeOf<P>();
    expectTypeOf<'items'>().toMatchTypeOf<P>();
  });

  it('form.get() returns the correct value type for known paths', () => {
    const form = createForm<SignupValues>({
      initialValues: { email: '', age: 0, items: [] },
    });
    expectTypeOf(form.get('email')).toEqualTypeOf<string>();
    expectTypeOf(form.get('age')).toEqualTypeOf<number>();
  });

  it('form.set() first overload val type is GetPathValue<T, P> for a known path', () => {
    // When P = 'email', val should be string
    expectTypeOf<GetPathValue<SignupValues, 'email'>>().toEqualTypeOf<string>();
    // When P = 'age', val should be number
    expectTypeOf<GetPathValue<SignupValues, 'age'>>().toEqualTypeOf<number>();
  });

  it('form.set() rejects wrong value type on known path', () => {
    const form = createForm<SignupValues>({
      initialValues: { email: '', age: 0, items: [] },
    });
    // @ts-expect-error — number not assignable to string
    form.set('email', 42);
    // @ts-expect-error — string not assignable to number
    form.set('age', 'twenty');
  });

  it('form.arrayAppend() rejects wrong item type on known path', () => {
    const form = createForm<SignupValues>({
      initialValues: { email: '', age: 0, items: [] },
    });
    // @ts-expect-error — string not assignable to { name: string; qty: number }
    form.arrayAppend('items', 'not-an-object');
  });

  it('form.set() compiles with correct value type', () => {
    const form = createForm<SignupValues>({
      initialValues: { email: '', age: 0, items: [] },
    });
    // These must compile without error
    form.set('email', 'hello@example.com');
    form.set('age', 42);
    // Loose fallback: dynamic/computed paths still work
    const dyn: string = 'email';
    form.set(dyn, 'anything');
    // Segment array still works
    form.set(['items', '0', 'name'], 'widget');
  });

  it('arrayAppend typed overload resolves correct item type', () => {
    // Test that ArrayItem<GetPathValue<T, 'items'>> resolves to the element type
    type ItemType = ArrayItem<GetPathValue<SignupValues, 'items'>>;
    expectTypeOf<ItemType>().toEqualTypeOf<{ name: string; qty: number }>();
  });

  it('arrayAppend compiles with correct item type', () => {
    const form = createForm<SignupValues>({
      initialValues: { email: '', age: 0, items: [] },
    });
    // This must compile without error
    form.arrayAppend('items', { name: 'widget', qty: 1 });
    // Loose fallback: dynamic path still works
    const path: string = 'items';
    form.arrayAppend(path, { name: 'x', qty: 0 });
  });

  it('ArrayItem<V> extracts element type from array', () => {
    type Items = Array<{ name: string; qty: number }>;
    expectTypeOf<ArrayItem<Items>>().toEqualTypeOf<{ name: string; qty: number }>();
  });

  it('ArrayItem<V> is never for non-array types', () => {
    expectTypeOf<ArrayItem<string>>().toEqualTypeOf<never>();
    expectTypeOf<ArrayItem<number>>().toEqualTypeOf<never>();
  });

  it('GetPathValue resolves value type at a path', () => {
    expectTypeOf<GetPathValue<SignupValues, 'email'>>().toEqualTypeOf<string>();
    expectTypeOf<GetPathValue<SignupValues, 'age'>>().toEqualTypeOf<number>();
  });

  it('SetOptions has correct shape', () => {
    expectTypeOf<SetOptions>().toEqualTypeOf<{ touch?: boolean; validate?: boolean }>();
  });
});
