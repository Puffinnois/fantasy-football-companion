/**
 * Minimal RFC 4180 parser: quoted fields (nflverse quotes `headshot_url`, which contains commas),
 * doubled quotes inside quoted fields, LF or CRLF line ends, optional BOM. Returns one object per
 * data row keyed by the header. Blank lines are ignored; short rows are padded with ''.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = text.charCodeAt(0) === 0xfeff ? 1 : 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c !== '"') field += c
      else if (text[i + 1] === '"') {
        field += '"'
        i++
      } else quoted = false
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
    } else field += c
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  const [header, ...body] = rows
  if (!header) return []
  return body.map((r) => {
    const obj: Record<string, string> = {}
    header.forEach((h, idx) => {
      obj[h] = r[idx] ?? ''
    })
    return obj
  })
}

/** R exports write missing values as the literal "NA" or an empty field. */
export function numOrNull(value: string | undefined): number | null {
  if (value === undefined || value === '' || value === 'NA') return null
  const n = Number(value)
  return Number.isNaN(n) ? null : n
}

export function strOrNull(value: string | undefined): string | null {
  return value === undefined || value === '' || value === 'NA' ? null : value
}
