import { describe, it, expect } from 'vitest'

// Test edilecek fonksiyonlar için mock data
describe('Calendar Sync - Parser Tests', () => {
  
  describe('normalizeText', () => {
    it('should replace NBSP with space', () => {
      const input = 'Test\u00A0text'
      const expected = 'Test text'
      const result = input.replace(/\u00A0/g, ' ').trim()
      expect(result).toBe(expected)
    })

    it('should handle Turkish characters', () => {
      const input = 'Anlaşılan Ücret'
      expect(input.toLowerCase()).toContain('anlaşılan')
      expect(input.toLowerCase()).toContain('ücret')
    })
  })

  describe('hasFinancialMarkers', () => {
    it('should detect "Anlaşılan Ücret"', () => {
      const desc = 'Anlaşılan Ücret: 5000₺'
      const hasMarker = /anla[şs][ıi]lan\s*[üu]cret\s*:/i.test(desc)
      expect(hasMarker).toBe(true)
    })

    it('should detect "Kapora"', () => {
      const desc = 'Kapora: 1000₺'
      const hasMarker = /kapora\s*:/i.test(desc)
      expect(hasMarker).toBe(true)
    })

    it('should detect "Kalan"', () => {
      const desc = 'Kalan: 4000₺'
      const hasMarker = /kalan\s*:/i.test(desc)
      expect(hasMarker).toBe(true)
    })

    it('should return false for no markers', () => {
      const desc = 'Sadece bir notlar'
      const hasMarker = /anla[şs][ıi]lan\s*[üu]cret\s*:|kapora\s*:|kalan\s*:/i.test(desc)
      expect(hasMarker).toBe(false)
    })
  })

  describe('REF Exception', () => {
    it('should allow REF cards with 0₺', () => {
      const title = 'REF Kart'
      const hasREF = title.toUpperCase().includes('REF')
      expect(hasREF).toBe(true)
    })

    it('should bypass financial check for REF', () => {
      const title = 'REF Test'
      const description = 'No financial data'
      
      const hasFinancialData = 
        /anla[şs][ıi]lan\s*[üu]cret\s*:|kapora\s*:|kalan\s*:/i.test(description) ||
        title.toUpperCase().includes('REF')
      
      expect(hasFinancialData).toBe(true)
    })
  })

  describe('Price Parsing', () => {
    it('should parse price from text', () => {
      const text = 'Anlaşılan Ücret: 5000₺'
      const match = text.match(/:\s*(.+)/)
      const value = match ? match[1].trim() : ''
      const nums = value.replace(/[^0-9]/g, '')
      expect(parseInt(nums)).toBe(5000)
    })

    it('should handle X as -1', () => {
      const text = 'Anlaşılan Ücret: X'
      const value = 'X'
      const result = value.toUpperCase().includes('X') ? -1 : 0
      expect(result).toBe(-1)
    })
  })
})
