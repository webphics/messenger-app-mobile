import { router } from 'expo-router'

import { CatalogAddForm } from '@/components/hub/catalog-add-form'
import { addKnowledge } from '@/lib/mock-catalog'

export default function AdminKnowledgeAddScreen() {
  return (
    <CatalogAddForm
      submitLabel="Add article"
      fields={[
        { key: 'title', label: 'Title', placeholder: 'Article title' },
        {
          key: 'body',
          label: 'Body',
          placeholder: 'Copyable steps or script',
          multiline: true,
        },
        { key: 'tags', label: 'Tags', placeholder: 'billing, access', required: false },
      ]}
      onSubmit={(values) => {
        addKnowledge({
          title: values.title,
          body: values.body,
          tags: values.tags,
        })
        router.back()
      }}
    />
  )
}
