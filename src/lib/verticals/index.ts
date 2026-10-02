export { VERTICALS, DEFAULT_VERTICAL, resolveVertical, DEFAULT_TERMS } from './registry'
export { NAV_ROUTES } from './nav-routes'
export { term, termCount } from './terms'
export type { TermKey, TermOpts } from './terms'
export { canUseChairs, canInferTitles, canDetectEnsembles, showBooksTab } from './features'
export { orchestralTitleRules, plainTitleRules } from './title-rules'
export { VERTICAL_KEYS } from './types'
export { brandFor, productTitleFor, DEFAULT_BRAND } from './brand'
export { isViolinOne, VIOLIN_ONE_LEAD, MUSIC_SESSION_TYPES, MUSIC_ADD_SESSION_TYPES, MUSIC_SECTIONS, MUSIC_PROJECT_PRESETS } from './defaults'
export { addSessionChoices, countSessionTypes, newSessionDefaults, sessionColorKey, sessionTypeText } from './sessions'
export type { AddSessionChoice, SessionCounts } from './sessions'
export { threeCallShowServices, leaderFeeForNewService, mainSessionLabel } from './presets'
export type { PresetService } from './presets'
export type {
  VerticalKey,
  VerticalTemplate,
  VerticalBrand,
  SessionTypeOption,
  LeadFallbackSkill,
  ProjectPresetKey,
  TermDictionary,
  TermForms,
  VerticalFeatures,
  NavConfig,
  NavItem,
  NavItemId,
  TitleRules,
  SkillSeed,
  PositionInput,
} from './types'
