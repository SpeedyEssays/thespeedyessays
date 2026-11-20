import { z } from 'zod'

export const supportNameInput = z
  .string()
  .trim()
  .max(40)
  .regex(
    /^\p{L}[\p{L}\p{M}]*(?:[’'-]\p{L}[\p{L}\p{M}]*)*$/u,
    'Enter one first name, such as Marvin.',
  )

export const supportNameRequired =
  'Ask the site owner to set your support name in Admins before you reply.'
