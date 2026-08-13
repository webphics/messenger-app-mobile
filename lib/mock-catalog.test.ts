import {
  addFaq,
  addKnowledge,
  addOffer,
  getChart,
  getKnowledge,
  listCharts,
  listFaqs,
  listKnowledge,
  listOffers,
  resetCatalog,
} from '@/lib/mock-catalog'
import { FAQ_ITEMS, KNOWLEDGE, OFFERS } from '@/lib/mock-data'

describe('mock-catalog', () => {
  afterEach(() => {
    resetCatalog()
  })

  test('lists seed data', () => {
    expect(listFaqs()).toHaveLength(FAQ_ITEMS.length)
    expect(listKnowledge()).toHaveLength(KNOWLEDGE.length)
    expect(listOffers()).toHaveLength(OFFERS.length)
    expect(listCharts().length).toBeGreaterThan(0)
  })

  test('addFaq appends', () => {
    const item = addFaq({ question: 'New Q', answer: 'New A' })
    expect(listFaqs().at(-1)).toEqual(item)
    expect(getKnowledge('kb-reset')?.title).toBe('Password reset script')
  })

  test('addKnowledge appends and getKnowledge finds it', () => {
    const item = addKnowledge({
      title: 'New article',
      body: 'Body text',
      tags: 'billing, Access',
    })
    expect(item.tags).toEqual(['billing', 'access'])
    expect(getKnowledge(item.id)).toEqual(item)
  })

  test('addOffer defaults visual and cta', () => {
    const item = addOffer({ title: 'Flash promo', subtitle: 'This week only' })
    expect(item.visual).toBe('payouts')
    expect(item.ctaLabel).toBe('View offer')
    expect(item.chatId).toBe('offers')
    expect(listOffers().at(-1)).toEqual(item)
  })

  test('getChart finds seed metric', () => {
    expect(getChart('open-threads')?.title).toBe('Open threads')
    expect(getChart('missing')).toBeUndefined()
  })
})
