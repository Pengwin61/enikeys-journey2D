// Deterministic, editable assets. Run from any directory: node scripts/build-brand.cjs
const fs = require('node:fs');
const path = require('node:path');
const brand = require('../src/brand.js');
const dest = path.join(__dirname, '../assets/brand');
fs.mkdirSync(dest, { recursive: true });
const svg = (w,h,content,label) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${label}"><title>${label}</title>${content}</svg>\n`;
const mark = (x,y,w,color) => `<g transform="translate(${x} ${y}) scale(${w/104})">${brand.markSvg(color)}</g>`;
// A small geometric alphabet avoids external fonts or missing glyphs in exported SVG.
const glyphs = {
 M:'0,7 0,0 2,0 3,3 4,0 6,0 6,7 4.5,7 4.5,2.5 3,6 1.5,2.5 1.5,7',
 O:'0,1 1,0 5,0 6,1 6,6 5,7 1,7 0,6|1.5,1.5 1.5,5.5 4.5,5.5 4.5,1.5',
 N:'0,7 0,0 1.5,0 4.5,4.4 4.5,0 6,0 6,7 4.5,7 1.5,2.6 1.5,7',
 L:'0,0 1.5,0 1.5,5.5 6,5.5 6,7 0,7',
 I:'1,0 5,0 5,1.5 3.75,1.5 3.75,5.5 5,5.5 5,7 1,7 1,5.5 2.25,5.5 2.25,1.5 1,1.5',
 T:'0,0 6,0 6,1.5 3.75,1.5 3.75,7 2.25,7 2.25,1.5 0,1.5',
 H:'0,0 1.5,0 1.5,2.75 4.5,2.75 4.5,0 6,0 6,7 4.5,7 4.5,4.25 1.5,4.25 1.5,7 0,7',
 C:'0,1 1,0 6,0 6,1.5 1.5,1.5 1.5,5.5 6,5.5 6,7 1,7 0,6',
 R:'0,7 0,0 5,0 6,1 6,3.5 4.6,4.4 6,7 4.3,7 2.9,4.5 1.5,4.5 1.5,7|1.5,1.5 1.5,3 4.5,3 4.5,1.5',
 P:'0,7 0,0 5,0 6,1 6,3.5 5,4.5 1.5,4.5 1.5,7|1.5,1.5 1.5,3 4.5,3 4.5,1.5',
 E:'0,0 6,0 6,1.5 1.5,1.5 1.5,2.75 5,2.75 5,4.25 1.5,4.25 1.5,5.5 6,5.5 6,7 0,7',
 D:'0,0 4,0 6,2 6,5 4,7 0,7|1.5,1.5 1.5,5.5 3.4,5.5 4.5,4.4 4.5,2.6 3.4,1.5',
 A:'0,7 0,2 2,0 4,0 6,2 6,7 4.5,7 4.5,4.5 1.5,4.5 1.5,7|1.5,3 4.5,3 4.5,2.6 3.4,1.5 2.6,1.5 1.5,2.6',
 G:'0,1 1,0 6,0 6,1.5 1.5,1.5 1.5,5.5 4.5,5.5 4.5,4.25 3,4.25 3,2.75 6,2.75 6,7 1,7 0,6',
 S:'1,0 6,0 6,1.5 1.5,1.5 1.5,2.75 5,2.75 6,3.75 6,6 5,7 0,7 0,5.5 4.5,5.5 4.5,4.25 1,4.25 0,3.25 0,1',
};
function lettering(str,x,y,size,color) {
 let pos=0;
 const paths=[...str].map(ch=>{
   const offset=pos;pos+=ch===' '?4:8;
   if(ch==='·')return `<circle cx="${offset+2}" cy="3.5" r=".8"/>`;
   const data=glyphs[ch]; if(!data)return '';
   const d=data.split('|').map(poly=>'M'+poly.trim().replaceAll(' ',' L')+'Z').join(' ');
   return `<path transform="translate(${offset} 0)" d="${d}" fill-rule="evenodd"/>`;
 }).join('');
 return `<g transform="translate(${x} ${y}) scale(${size/7})" fill="${color}">${paths}</g>`;
}
const write=(name,w,h,body)=>fs.writeFileSync(path.join(dest,name+'.svg'),svg(w,h,body,'Monolith Corp — '+name));
for(const variant of ['amber','ivory','red','gray']) {
 const c=brand.palette[variant];
 write('monolith-mark-'+variant,104,128,brand.markSvg(c));
 write('monolith-lockup-'+variant,520,128,mark(0,0,90,c)+lettering('MONOLITH CORP',118,37,27,c)+lettering(brand.tagline,119,83,9,c));
}
write('monolith-stencil',104,128,brand.markSvg(brand.palette.ink));
write('monolith-banner',192,448,'<path d="M2 2H190V446L96 420 2 446Z" fill="#151922" stroke="#574436" stroke-width="3"/>'+mark(44,34,104,brand.palette.amber)+lettering('MONOLITH',20,194,18,brand.palette.ivory)+lettering('CORP',56,224,18,brand.palette.ivory)+lettering('PEOPLE',43,295,15,brand.palette.gray)+lettering('DATA',60,328,15,brand.palette.gray)+lettering('PROGRESS',26,361,15,brand.palette.gray));
write('monolith-badge',160,224,'<rect x="4" y="4" width="152" height="216" rx="9" fill="#151922" stroke="#b58a64" stroke-width="3"/><rect x="57" y="13" width="46" height="8" rx="4" fill="#05070c"/>'+mark(60,31,40,brand.palette.ivory)+lettering('MONOLITH CORP',20,90,9,brand.palette.ivory)+'<rect x="31" y="114" width="98" height="62" rx="2" fill="#28313c"/><circle cx="80" cy="134" r="12" fill="#b58a64"/><path d="M54 170V162Q54 146 80 146T106 162V170" fill="#b58a64"/>'+lettering('PEOPLE',47,188,10,brand.palette.ivory));
write('monolith-terminal',320,200,'<rect x="1" y="1" width="318" height="198" rx="5" fill="#0c1119" stroke="#77533c" stroke-width="2"/>'+mark(21,22,48,brand.palette.amber)+lettering('MONOLITH CORP',87,35,15,brand.palette.amber)+lettering('PEOPLE',33,113,12,brand.palette.ivory)+lettering('DATA',33,140,12,brand.palette.ivory)+lettering('PROGRESS',33,167,12,brand.palette.ivory));
console.log('Wrote 12 Monolith SVG assets to assets/brand/');
