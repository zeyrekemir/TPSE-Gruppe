import { describe, expect, it } from 'vitest'
import i18n from '../i18n'

function keys(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  )
}

describe('translations', () => {
  const en = i18n.getResourceBundle('en', 'translation')
  const de = i18n.getResourceBundle('de', 'translation')

  it('German and English have exactly the same keys', () => {
    expect(keys(de).sort()).toEqual(keys(en).sort())
  })

  it('has no empty strings', () => {
    for (const bundle of [en, de]) {
      for (const key of keys(bundle)) {
        expect(i18n.getFixedT(bundle === en ? 'en' : 'de')(key), key).not.toBe('')
      }
    }
  })
})
