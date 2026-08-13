import { router } from 'expo-router'

import { CatalogAddForm } from '@/components/hub/catalog-add-form'
import { addOffer } from '@/lib/mock-catalog'

export default function AdminOfferAddScreen() {
  return (
    <CatalogAddForm
      submitLabel="Add offer"
      fields={[
        { key: 'title', label: 'Title', placeholder: 'Offer title' },
        {
          key: 'subtitle',
          label: 'Subtitle',
          placeholder: 'Short promo line',
          multiline: true,
        },
        { key: 'ctaLabel', label: 'Button label', placeholder: 'View offer', required: false },
      ]}
      onSubmit={(values) => {
        addOffer({
          title: values.title,
          subtitle: values.subtitle,
          ctaLabel: values.ctaLabel,
        })
        router.back()
      }}
    />
  )
}
