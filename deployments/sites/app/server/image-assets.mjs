// Replace only known default images; preserve images uploaded or selected by the owner.
export const imageReplacements = [
  ['https://images.unsplash.com/photo-1577158200653-64da653062d3?auto=format&fit=crop&q=80&w=400', '/assets/images/generated/pharmacy.webp'],
  ['https://images.unsplash.com/photo-1584515901387-a7a1a7f35360?auto=format&fit=crop&q=80&w=400', '/assets/images/generated/nursing.webp'],
  ['https://images.unsplash.com/photo-1505151828120-04874d82b6b0?auto=format&fit=crop&q=80&w=400', '/assets/images/generated/midwifery.webp'],
  ['https://images.unsplash.com/photo-1579684389782-64d84b5e905d?auto=format&fit=crop&q=80&w=400', '/assets/images/generated/dental-lab.webp'],
  ["https://images.unsplash.com/photo-1606811971618-4486d14f3f99?auto=format&fit=crop&q=80&w=400", "/assets/images/programs/dental-tech.webp"],
  ["https://images.unsplash.com/photo-1551076805-e1869033e561?auto=format&fit=crop&q=80&w=400", "/assets/images/programs/operations.webp"],
  ["https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&q=80&w=400", "/assets/images/programs/physician-assistant.webp"],
  ["https://images.unsplash.com/photo-1582719508461-905c673771fd?auto=format&fit=crop&q=80&w=400", "/assets/images/programs/laboratories.webp"],
  ["https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=400", "/assets/images/programs/business.webp"],
  ["https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&q=80&w=400", "/assets/images/programs/accounting.webp"],
  ["https://images.unsplash.com/photo-1517694712202-14dd9538aa97?auto=format&fit=crop&q=80&w=400", "/assets/images/programs/it.webp"],
  ["https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&q=80&w=400", "/assets/images/programs/decor.webp"],
];

export async function refreshDefaultImages(db) {
  if (await db.prepare('SELECT value FROM settings WHERE key=?').bind('__image_assets_v2').first()) return;
  const statements = [];
  for (const table of ['departments', 'labs']) {
    for (const [oldUrl, newUrl] of imageReplacements) {
      statements.push(db.prepare(`UPDATE ${table} SET image_url=? WHERE image_url=?`).bind(newUrl, oldUrl));
    }
  }
  statements.push(db.prepare('INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)').bind('__image_assets_v2', '1'));
  await db.batch(statements);
}
