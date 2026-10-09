/**
 * The rules a Community draft is checked against before it is saved, mirrored
 * from `CreateCommunitySchema` and `UpdateCommunitySchema`.
 */

export const COMMUNITY_NAME_MAX = 80
export const COMMUNITY_DESCRIPTION_MAX = 500

/**
 * What is wrong with a draft, or null when it can be saved. Creating also needs
 * an organization and at least one member; an edit changes the name and
 * description only.
 */
export function communityDraftProblem(draft: {
  name: string
  description: string
  creating: boolean
  organizationId: string | null
  memberIds: readonly string[]
}): string | null {
  const name = draft.name.trim()
  if (!name) return 'Give the community a name.'
  if (name.length > COMMUNITY_NAME_MAX) return `Keep the name to ${COMMUNITY_NAME_MAX} characters.`
  if (draft.description.trim().length > COMMUNITY_DESCRIPTION_MAX) {
    return `Keep the description to ${COMMUNITY_DESCRIPTION_MAX} characters.`
  }
  if (!draft.creating) return null
  if (!draft.organizationId) return 'Choose the organization it belongs to.'
  if (draft.memberIds.length === 0) return 'Add at least one member.'
  return null
}
