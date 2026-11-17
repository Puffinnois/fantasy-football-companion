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

/** An enum longer than this is a list of metric ids. */
const LONG_ENUM = 40
const METRIC_HINT = 'A metric id, such as yprr or rush_epa; find gives the ids for a stat’s name.'

/**
 * The schema Claude reads: the full profile's, without the lists of metric ids. Those are about 300
 * ids, seven times over: 34 of the 51 KB the tools take, some 9,000 tokens in every conversation.
 * `find` gives the ids, and the analyst still checks each call against the full schema and names
 * the nearest ids when one is wrong.
 */
export function listedSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(listedSchema)
  if (!schema || typeof schema !== 'object') return schema
  const node = schema as Record<string, unknown>
  if (Array.isArray(node.enum) && node.enum.length > LONG_ENUM) {
    const description = [node.description, METRIC_HINT].filter(Boolean).join(' ')
    return { type: 'string', description }
  }
  return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, listedSchema(v)]))
}

/**
 * The schema fits strict structured output (OpenAI's `strict: true`): every object closes its
 * properties and requires all of them. Other schemas are sent without `strict`.
 */
export function strictCompatible(schema: Schema): boolean {
  if (schema.type === 'object') {
    const keys = Object.keys(schema.properties ?? {})
    if (schema.additionalProperties !== false || keys.length === 0) return false
    if (!keys.every((k) => schema.required?.includes(k))) return false
    return keys.every((k) => strictCompatible(schema.properties![k]))
  }
  if (schema.type === 'array') return schema.items ? strictCompatible(schema.items) : false
  return true
}
