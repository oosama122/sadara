export function normalizeText(value) {
  return String(value ?? '').normalize('NFKC').toLowerCase()
    .replace(/[\u064b-\u065f\u0670\u0640]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .replace(/[٠-٩]/g, char => String(char.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, char => String(char.charCodeAt(0) - 0x6f0)).replace(/\s+/g, ' ').trim();
}

export function filterPrograms(programs, {query = '', category = 'all', saved = []} = {}) {
  const terms = normalizeText(query).split(' ').filter(Boolean);
  const favorites = new Set(saved);
  return programs.filter(program => {
    if (category === 'saved' && !favorites.has(program.code)) return false;
    if (['medical', 'tech'].includes(category) && program.category !== category) return false;
    const content = normalizeText([program.name, program.code, program.description, program.careers,
      ...(Array.isArray(program.courses) ? program.courses.map(course => course.name) : [])].join(' '));
    return terms.every(term => content.includes(term));
  });
}

export function matchingFee(program, fees) {
  const compact = value => normalizeText(value).replace(/[^\p{L}\p{N}]/gu, '');
  const name = compact(program?.name);
  if (!name) return null;
  const options = fees.flatMap(fee => String(fee.department_name || '').split('/').map(part => ({fee, name:compact(part)})));
  return options.find(option => option.name === name)?.fee ||
    options.find(option => option.name.length >= 4 && (name.startsWith(option.name) || option.name.startsWith(name)))?.fee || null;
}

export function restoreCodes(raw, programs, limit = 100) {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    const allowed = new Set(programs.map(program => program.code));
    return [...new Set(parsed.filter(code => typeof code === 'string' && allowed.has(code)))].slice(0, limit);
  } catch { return []; }
}

export function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r\n]/.test(text.trimStart()) || /^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

export function csvDocument(rows) {
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
}
