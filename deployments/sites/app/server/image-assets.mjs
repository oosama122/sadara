// Match only known broken defaults; preserve images uploaded or selected by the owner.
export const imageReplacements = [
  ['https://images.unsplash.com/photo-1577158200653-64da653062d3?auto=format&fit=crop&q=80&w=400', '/assets/images/generated/pharmacy.webp'],
  ['https://images.unsplash.com/photo-1584515901387-a7a1a7f35360?auto=format&fit=crop&q=80&w=400', '/assets/images/generated/nursing.webp'],
  ['https://images.unsplash.com/photo-1505151828120-04874d82b6b0?auto=format&fit=crop&q=80&w=400', '/assets/images/generated/midwifery.webp'],
  ['https://images.unsplash.com/photo-1579684389782-64d84b5e905d?auto=format&fit=crop&q=80&w=400', '/assets/images/generated/dental-lab.webp'],
];

export async function refreshDefaultImages(db) {
  if (await db.prepare('SELECT value FROM settings WHERE key=?').bind('__image_assets_v1').first()) return;
  const statements = [];
  for (const table of ['departments', 'labs']) {
    for (const [oldUrl, newUrl] of imageReplacements) {
      statements.push(db.prepare(`UPDATE ${table} SET image_url=? WHERE image_url=?`).bind(newUrl, oldUrl));
    }
  }
  statements.push(db.prepare('INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)').bind('__image_assets_v1', '1'));
  await db.batch(statements);
}
