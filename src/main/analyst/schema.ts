/**
 * A small JSON Schema checker for tool arguments (Ask spec §3.3): the subset the analyst tools use —
 * type, enum, required, properties, additionalProperties, items, minItems, maxItems, maxLength,
 * pattern. It answers the first problem in words a model can act on, or null when the value fits.
 */
export type Schema = {
  type?: 'object' | 'array' | 'string' | 'integer' | 'number' | 'boolean'
  enum?: readonly (string | number | boolean)[]
  properties?: Record<string, Schema>
  required?: readonly string[]
  additionalProperties?: boolean
  items?: Schema
  minItems?: number
  maxItems?: number
  maxLength?: number
  pattern?: string
  description?: string
}

const show = (v: unknown): string => JSON.stringify(v)

export function check(schema: Schema, value: unknown, path = 'arguments'): string | null {
  if (schema.enum) {
    if (!schema.enum.includes(value as never)) {
      const list =
        schema.enum.length <= 12 ? schema.enum.map(show).join(', ') : `${schema.enum.length} values`
      return `${path} must be one of ${list}, not ${show(value)}`
    }
    return null
  }
  switch (schema.type) {
    case 'object': {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        return `${path} must be an object`
      }
      const obj = value as Record<string, unknown>
      for (const key of schema.required ?? []) {
        if (obj[key] === undefined) return `${path}.${key} is required`
      }
      for (const [key, v] of Object.entries(obj)) {
        const sub = schema.properties?.[key]
        if (!sub) {
          if (schema.additionalProperties === false) {
            const known = Object.keys(schema.properties ?? {}).join(', ')
            return `${path}.${key} is not an argument; the arguments are ${known}`
          }
          continue
        }
        if (v === undefined || v === null) continue
        const err = check(sub, v, `${path}.${key}`)
        if (err) return err
      }
      return null
    }
    case 'array': {
      if (!Array.isArray(value)) return `${path} must be a list`
      if (schema.minItems !== undefined && value.length < schema.minItems) {
        return `${path} needs at least ${schema.minItems} item(s)`
      }
      if (schema.maxItems !== undefined && value.length > schema.maxItems) {
        return `${path} takes at most ${schema.maxItems} item(s)`
      }
      for (let i = 0; i < value.length; i++) {
        const err = schema.items ? check(schema.items, value[i], `${path}[${i}]`) : null
        if (err) return err
      }
      return null
    }
    case 'string':
      if (typeof value !== 'string') return `${path} must be text`
      if (schema.maxLength !== undefined && value.length > schema.maxLength) {
        return `${path} is longer than ${schema.maxLength} characters`
      }
      if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
        return `${path} is not valid (${show(value)})`
      }
      return null
    case 'integer':
      return Number.isInteger(value) ? null : `${path} must be a whole number`
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? null : `${path} must be a number`
    case 'boolean':
      return typeof value === 'boolean' ? null : `${path} must be true or false`
    default:
      return null
  }
}
