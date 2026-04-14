export type FormattingModeId = 'none' | 'email'

export interface FormattingMode {
  id: FormattingModeId
  label: string
  description: string
}

export const FORMATTING_MODES: FormattingMode[] = [
  { id: 'none', label: 'None', description: 'No formatting applied' },
  {
    id: 'email',
    label: 'Email',
    description: 'Format as a clean, professional email',
  },
]

export function isValidFormattingModeId(id: unknown): id is FormattingModeId {
  return id === 'none' || id === 'email'
}
