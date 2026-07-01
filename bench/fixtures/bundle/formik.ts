import { useFormik } from 'formik'

export function useDemoForm() {
  const formik = useFormik({
    initialValues: { email: '' },
    validate: (values) => (!values.email.includes('@') ? { email: 'Invalid' } : {}),
    onSubmit: () => {},
  })
  formik.validateForm()
}
