import { useForm, useField } from 'vee-validate'

export function useDemoForm() {
  useForm()
  return useField('email', (v: string) => v.includes('@') || 'Invalid')
}
