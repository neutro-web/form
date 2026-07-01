import { createForm } from 'felte'

export function useDemoForm() {
  return createForm({
    initialValues: { email: '' },
    validate: (values: Record<string, string>) =>
      !values.email.includes('@') ? { email: ['Invalid'] } : {},
  })
}
