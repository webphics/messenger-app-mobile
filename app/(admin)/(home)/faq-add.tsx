import { router } from 'expo-router'

import { CatalogAddForm } from '@/components/hub/catalog-add-form'
import { addFaq } from '@/lib/mock-catalog'

export default function AdminFaqAddScreen() {
  return (
    <CatalogAddForm
      submitLabel="Add FAQ"
      fields={[
        { key: 'question', label: 'Question', placeholder: 'How do I…' },
        {
          key: 'answer',
          label: 'Answer',
          placeholder: 'Short answer',
          multiline: true,
        },
      ]}
      onSubmit={(values) => {
        addFaq({ question: values.question, answer: values.answer })
        router.back()
      }}
    />
  )
}
