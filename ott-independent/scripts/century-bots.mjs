import { readFileSync } from 'node:fs';
const families = [
  ['Sprinter',24,10,5,30,0,2],['Guardian',18,35,80,180,0,2],
  ['Tactician'],['Raider',12,100,25,80,0,3],['Sentinel',17,25,65,400,0,2],
  ['Flanker',22,20,30,100,2,4],['Explorer',15,25,25,80,0,22],
  ['Hunter',14,75,55,120,0,3],['Runner',30,5,15,60,0,2],
  ['Counter'],['Balanced',21,40,50,180,0,5],
];
export function opponent(index) {
  if (!Number.isInteger(index) || index < 0 || index >= 99) throw new Error('Opponent index must be 0..98');
  const family = families[index % families.length], variant = Math.floor(index / families.length) + 1;
  const name = `${family[0]} ${String(variant).padStart(2,'0')}`;
  let source;
  if (family[0] === 'Tactician' || family[0] === 'Counter') {
    source = readFileSync(new URL('../public/bots/tactician.py',import.meta.url),'utf8')
      .replace('45 - d * 2',`${35+variant*3} - d * 2`)
      .replace('65 * (arrival',`${family[0]==='Counter'?50+variant*3:65+variant*4} * (arrival`)
      .replace('safe[:12]',`safe[:${6+variant%5}]`)
      .replace('replies[:12]',`replies[:${7+variant%6}]`)
      .replace('(80 if board[b] else 0)',`(${50+variant*8} if board[b] else 0)`);
  } else {
    const [,race,capture,danger,defense,flank,noise] = family;
    const profile = {variant, race:race+variant-5,tempo:4+variant,capture:capture+variant*2,danger:danger+variant*2,defense:defense+variant*5,flank,noise,repeat:3+variant};
    source = `PROFILE = ${JSON.stringify(profile)}\n\n` + readFileSync(new URL('./bot-opponent-template.py',import.meta.url),'utf8');
  }
  return { name, family:family[0], variant, source:`# UET synthetic opponent ${index+1}: ${name}\n${source}` };
}
