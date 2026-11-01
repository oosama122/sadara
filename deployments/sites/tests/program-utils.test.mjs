import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeText,filterPrograms,matchingFee,restoreCodes,csvCell,csvDocument} from '../public/js/program-utils.mjs';
const seed=JSON.parse(readFileSync(new URL('../app/server/seed.json',import.meta.url),'utf8'));
test('Arabic search accepts diacritics, alternate letters and both Arabic numeral forms',()=>{
 assert.equal(normalizeText(' تِقْنِيّة  مَعلومات ١٢٣ ۴۵ '),'تقنيه معلومات 123 45');
 assert.equal(filterPrograms(seed.departments,{query:'صَيْدَلَة'}).some(program=>program.code==='pharmacy'),true);
 assert.equal(filterPrograms(seed.departments,{query:'تقنيه معلومات'}).some(program=>program.code==='it'),true);
});
test('discovery combines subject, keywords and saved filters without mutating data',()=>{
 assert.equal(filterPrograms(seed.departments,{category:'medical'}).length,7);
 assert.equal(filterPrograms(seed.departments,{category:'tech'}).length,4);
 assert.deepEqual(filterPrograms(seed.departments,{category:'saved',saved:['pharmacy'],query:'صيدله'}).map(program=>program.code),['pharmacy']);
 assert.deepEqual(filterPrograms(seed.departments,{category:'saved',saved:[]}),[]);
 assert.equal(seed.departments.length,11);
});
test('grouped fee descriptions resolve all published college programs',()=>{
 const expected={'dental-tech':'$840',operations:'$595','physician-assistant':'$630',nursing:'$630',pharmacy:'$700',laboratories:'$700',midwifery:'$595',business:'$490',accounting:'$490',it:'$560',decor:'$560'};
 for(const program of seed.departments)assert.equal(matchingFee(program,seed.fees)?.discounted_fee,expected[program.code],program.code);
});
test('missing fee data stays unknown instead of guessing a price',()=>{
 assert.equal(matchingFee({name:'تخصص جديد'},seed.fees),null);
 assert.equal(matchingFee({name:''},seed.fees),null);
 assert.equal(matchingFee(seed.departments[0],[]),null);
});
test('stored selections ignore corrupt data, deleted programs and duplicate entries',()=>{
 for(const value of ['{bad','null','{}','"pharmacy"'])assert.deepEqual(restoreCodes(value,seed.departments),[]);
 assert.deepEqual(restoreCodes('["pharmacy","pharmacy","removed",{},"it","decor","business"]',seed.departments,3),['pharmacy','it','decor']);
});
test('CSV export prevents spreadsheet formulas and quotes names and phone numbers correctly',()=>{
 for(const value of ['=HYPERLINK("bad")','+967777123456','-1+2','@SUM(1)','  =2+2','\t=1'])assert.ok(csvCell(value).startsWith('"\''));
 assert.equal(csvCell('اسم "طالب", جديد'),'"اسم ""طالب"", جديد"');
 assert.equal(csvCell(null),'""');assert.equal(csvCell(88.5),'"88.5"');
 assert.equal(csvDocument([['الاسم','المعدل'],['طالب',88]]),'\uFEFF"الاسم","المعدل"\r\n"طالب","88"');
});
test('every program and laboratory image is a present local WebP asset',()=>{
 for(const item of [...seed.departments,...seed.labs]){
  assert.match(item.image_url,/^\/assets\/images\/(generated|programs)\/[a-z-]+\.webp$/);
  const data=readFileSync(new URL('../public'+item.image_url,import.meta.url));
  assert.equal(data.subarray(0,4).toString(),'RIFF');assert.equal(data.subarray(8,12).toString(),'WEBP');
 }
});
