import { CHART_METRICS, FAQ_ITEMS, KNOWLEDGE, OFFERS } from '@/lib/mock-data'
import type { ChartMetric, FaqItem, KnowledgeArticle, Offer } from '@/lib/types'

let extraFaqs: FaqItem[] = []
let extraKnowledge: KnowledgeArticle[] = []
let extraOffers: Offer[] = []

export function resetCatalog() {
  extraFaqs = []
  extraKnowledge = []
  extraOffers = []
}

export function listFaqs(): FaqItem[] {
  return [...FAQ_ITEMS, ...extraFaqs]
}

export function addFaq(input: { question: string; answer: string }): FaqItem {
  const item: FaqItem = {
    id: `faq-${Date.now()}-${extraFaqs.length}`,
    question: input.question.trim(),
    answer: input.answer.trim(),
  }
  extraFaqs = [...extraFaqs, item]
  return item
}

export function listKnowledge(): KnowledgeArticle[] {
  return [...KNOWLEDGE, ...extraKnowledge]
}

export function getKnowledge(id: string): KnowledgeArticle | undefined {
  return listKnowledge().find((item) => item.id === id)
}

export function addKnowledge(input: {
  title: string
  body: string
  tags?: string
}): KnowledgeArticle {
  const tags = (input.tags ?? '')
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
  const item: KnowledgeArticle = {
    id: `kb-${Date.now()}-${extraKnowledge.length}`,
    title: input.title.trim(),
    body: input.body.trim(),
    tags,
  }
  extraKnowledge = [...extraKnowledge, item]
  return item
}

export function listOffers(): Offer[] {
  return [...OFFERS, ...extraOffers]
}

export function addOffer(input: {
  title: string
  subtitle: string
  ctaLabel?: string
}): Offer {
  const item: Offer = {
    id: `offer-${Date.now()}-${extraOffers.length}`,
    title: input.title.trim(),
    subtitle: input.subtitle.trim(),
    ctaLabel: input.ctaLabel?.trim() || 'View offer',
    visual: 'payouts',
    chatId: 'offers',
  }
  extraOffers = [...extraOffers, item]
  return item
}

export function listCharts(): ChartMetric[] {
  return CHART_METRICS
}

export function getChart(id: string): ChartMetric | undefined {
  return CHART_METRICS.find((item) => item.id === id)
}
