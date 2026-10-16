// Turns the shot-type descriptions in content-prompts.json into CLIP text fingerprints for
// src/lib/content/prompts.json. The app only ever runs CLIP's image half; the descriptions never
// change at runtime, so their text half is run here, once. Re-run after editing the descriptions:
//
//   node scripts/content-prompts.mjs

import { readFileSync, writeFileSync } from 'node:fs'
import { AutoTokenizer, CLIPTextModelWithProjection } from '@huggingface/transformers'

const MODEL = 'Xenova/clip-vit-base-patch32'
const prompts = JSON.parse(readFileSync(new URL('./content-prompts.json', import.meta.url), 'utf8'))
const tokenizer = await AutoTokenizer.from_pretrained(MODEL)
const text = await CLIPTextModelWithProjection.from_pretrained(MODEL, { dtype: 'q8' })

const categories = {}
for (const [name, list] of Object.entries(prompts)) {
  const { text_embeds } = await text(tokenizer(list, { padding: 'max_length', truncation: true }))
  categories[name] = text_embeds
    .normalize(2, -1)
    .tolist()
    .map((v) => v.map((x) => Math.round(x * 10000) / 10000))
}
const out = { model: MODEL, dtype: 'q8', categories }
writeFileSync(new URL('../src/lib/content/prompts.json', import.meta.url), JSON.stringify(out))
console.log(`Wrote ${Object.values(categories).flat().length} prompt fingerprints for ${Object.keys(categories).length} shot types`)
