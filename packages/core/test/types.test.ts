import { describe, expectTypeOf, it } from 'vitest';
import {
  type ArrayItem,
  createForm,
  type GetPathValue,
  type Path,
  type SetOptions,
  zodAdapter,
  yupAdapter,
  valibotAdapter,
} from '../src/index';

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

  it('form.arrayInsert() rejects wrong item type on known path', () => {
    const form = createForm<SignupValues>({
      initialValues: { email: '', age: 0, items: [] },
    });
    // @ts-expect-error — string not assignable to { name: string; qty: number }
    form.arrayInsert('items', 0, 'not-an-object');
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

describe('Feature 5: Schema type inference', () => {
  // A minimal mock that matches the shape zodAdapter expects:
  // { safeParse: (values: T) => any }
  // Using a concrete object type so TypeScript must unify T across the call.
  const mockZodSchema = {
    safeParse: (_values: { email: string; username: string }) => ({ success: true }),
  };

  // A minimal mock for yupAdapter: { validate: (values: T, opts) => Promise<any> }
  const mockYupSchema = {
    validate: async (_values: { email: string; role: string }, _opts: { abortEarly: boolean }) =>
      undefined,
  };

  // A minimal mock for valibotAdapter:
  // { safeParse: (values: T) => { success: boolean; issues?: ... } }
  const mockValibotSchema = {
    safeParse: (_values: { name: string; age: number }) => ({
      success: true as boolean,
      issues: undefined as
        | Array<{ path: Array<{ key: string | number }>; message: string }>
        | undefined,
    }),
  };

  it('createForm infers T from initialValues without an explicit generic', () => {
    const form = createForm({
      initialValues: { email: '', username: '' },
    });
    // T is inferred as { email: string; username: string }
    // so form.get('email') must be string (not any)
    expectTypeOf(form.get('email')).toEqualTypeOf<string>();
    expectTypeOf(form.get('username')).toEqualTypeOf<string>();
  });

  it('createForm infers T when zodAdapter is used as validator', () => {
    const form = createForm({
      initialValues: { email: '', username: '' },
      validator: zodAdapter(mockZodSchema),
    });
    expectTypeOf(form.get('email')).toEqualTypeOf<string>();
    expectTypeOf(form.get('username')).toEqualTypeOf<string>();
  });

  it('createForm infers T when yupAdapter is used as validator', () => {
    const form = createForm({
      initialValues: { email: '', role: '' },
      validator: yupAdapter(mockYupSchema),
    });
    expectTypeOf(form.get('email')).toEqualTypeOf<string>();
    expectTypeOf(form.get('role')).toEqualTypeOf<string>();
  });

  it('createForm infers T when valibotAdapter is used as validator', () => {
    const form = createForm({
      initialValues: { name: '', age: 0 },
      validator: valibotAdapter(mockValibotSchema),
    });
    expectTypeOf(form.get('name')).toEqualTypeOf<string>();
    expectTypeOf(form.get('age')).toEqualTypeOf<number>();
  });

  it('explicit generic still compiles and is consistent with initialValues', () => {
    type Values = { email: string; username: string };
    const form = createForm<Values>({
      initialValues: { email: '', username: '' },
    });
    expectTypeOf(form.get('email')).toEqualTypeOf<string>();
    expectTypeOf(form.get('username')).toEqualTypeOf<string>();
  });

  it('zodAdapter<T> returns a function typed (values: T) => Record<string,string>', () => {
    type SchemaValues = { email: string; username: string };
    const adapted = zodAdapter<SchemaValues>(mockZodSchema);
    expectTypeOf(adapted).toEqualTypeOf<
      (values: SchemaValues) => Record<string, string>
    >();
  });

  it('yupAdapter<T> returns a function typed (values: T) => Promise<Record<string,string>>', () => {
    type SchemaValues = { email: string; role: string };
    const adapted = yupAdapter<SchemaValues>(mockYupSchema);
    expectTypeOf(adapted).toEqualTypeOf<
      (values: SchemaValues) => Promise<Record<string, string>>
    >();
  });

  it('valibotAdapter<T> returns a function typed (values: T) => Record<string,string>', () => {
    type SchemaValues = { name: string; age: number };
    const adapted = valibotAdapter<SchemaValues>(mockValibotSchema);
    expectTypeOf(adapted).toEqualTypeOf<
      (values: SchemaValues) => Record<string, string>
    >();
  });

  it('getState().values reflects the inferred T', () => {
    const form = createForm({
      initialValues: { count: 0, label: '' },
    });
    const state = form.getState();
    expectTypeOf(state.values.count).toEqualTypeOf<number>();
    expectTypeOf(state.values.label).toEqualTypeOf<string>();
  });
});
