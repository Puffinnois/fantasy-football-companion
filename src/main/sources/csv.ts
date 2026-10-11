/**
 * Minimal RFC 4180 parser: quoted fields (nflverse quotes `headshot_url`, which contains commas),
 * doubled quotes inside quoted fields, LF or CRLF line ends, optional BOM. Calls `onRow` with each
 * data row's fields (a short row is passed as it is) and the header, one row at a time, so a large
 * file never becomes one object per row. Blank lines are ignored. Returns the header ([] for empty
 * input).
 */
export function forEachCsvRow(
  text: string,
  onRow: (fields: string[], header: string[]) => void
): string[] {
  let header = null as string[] | null
  let row: string[] = []
  let field = ''
  let quoted = false
  const endRow = (): void => {
    if (row.length > 1 || row[0] !== '') {
      if (header === null) header = row
      else onRow(row, header)
    }
    row = []
  }
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
      endRow()
    } else field += c
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    endRow()
  }
  return header ?? []
}

/** Every data row as an object keyed by the header; short rows are padded with ''. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: Record<string, string>[] = []
  forEachCsvRow(text, (fields, header) => {
    const obj: Record<string, string> = {}
    header.forEach((h, idx) => {
      obj[h] = fields[idx] ?? ''
    })
    rows.push(obj)
  })
  return rows
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
