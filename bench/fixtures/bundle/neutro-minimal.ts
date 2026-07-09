import { createForm } from '@neutro/form/core/minimal'

const form = createForm({
  initialValues: { email: '' },
  validator: (values) => (!values.email.includes('@') ? { email: 'Invalid' } : {}),
})
form.set('email', 'test@example.com')
form.validate()
