import { createForm } from '@neutro/form-core'

const form = createForm({
  initialValues: { email: '' },
  validator: (values) => (!values.email.includes('@') ? { email: 'Invalid' } : {}),
})
form.set('email', 'test@example.com')
form.validate()
