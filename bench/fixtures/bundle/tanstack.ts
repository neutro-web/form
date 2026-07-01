import { useForm } from '@tanstack/react-form'

export function useDemoForm() {
  const form = useForm({ defaultValues: { email: '' } })
  form.validateAllFields('change')
}
