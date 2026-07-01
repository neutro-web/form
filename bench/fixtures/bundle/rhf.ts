import { useForm } from 'react-hook-form'

export function useDemoForm() {
  const { register, trigger } = useForm({ defaultValues: { email: '' } })
  register('email', { validate: (v) => v.includes('@') || 'Invalid' })
  trigger('email')
}
