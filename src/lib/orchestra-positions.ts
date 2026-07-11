/**
 * Orchestra Position Titles
 *
 * Maps chair numbers to proper orchestra position titles based on instrument.
 *
 * Standard Orchestra Hierarchy:
 * - Violin 1: Concertmaster (1), Assistant Concertmaster (2), Section (3+)
 * - Violin 2: Principal 2nd Violin (1), Assistant Principal (2), Section (3+)
 * - Viola: Principal Viola (1), Assistant Principal (2), Section (3+)
 * - Cello: Principal Cello (1), Assistant Principal (2), Section (3+)
 * - Bass: Principal Bass (1), Assistant Principal (2), Section (3+)
 * - Harp: Principal Harp (1), 2nd Harp (2)
 * - Winds/Brass: Principal (1), 2nd (2), 3rd (3), 4th (4)
 * - Percussion: Principal Timpani/Percussion (1), Section (2+)
 */

export interface PositionInfo {
  title: string
  shortTitle: string
  isLeadership: boolean
}

// Instrument name patterns for special handling
const VIOLIN_1_PATTERNS = /^violin\s*1|^1st\s*violin|^first\s*violin/i
const VIOLIN_2_PATTERNS = /^violin\s*2|^2nd\s*violin|^second\s*violin/i
const VIOLA_PATTERNS = /^viola/i
const CELLO_PATTERNS = /^cello|^violoncello/i
const BASS_PATTERNS = /^(double\s*)?bass|^contrabass|^string\s*bass/i
const HARP_PATTERNS = /^harp/i

// Section-based instruments (typically 2-4 players with numbered positions)
const WIND_BRASS_PATTERNS = /flute|piccolo|oboe|english\s*horn|clarinet|bassoon|saxophone|recorder|horn|trumpet|trombone|tuba|cornet|euphonium|flugelhorn/i

// Percussion
const TIMPANI_PATTERNS = /^timpani/i
const PERCUSSION_PATTERNS = /percussion|drums|drum\s*set|snare|bass\s*drum|cymbal|vibraphone|marimba|xylophone|glockenspiel|chimes/i

// Max ensemble size to use chamber-style titles (e.g. "1st Violin" instead of "Concertmaster")
const CHAMBER_MAX_SIZE = 8

export function getPositionTitle(
  instrumentName: string,
  chairNumber: number,
  section?: string | null,
  totalChairs?: number,
  ensembleSize?: number
): PositionInfo {
  const isChamber = ensembleSize !== undefined && ensembleSize <= CHAMBER_MAX_SIZE
  const singleChair = totalChairs !== undefined && totalChairs <= 1

  // For non-chamber contexts with only 1 chair per instrument, skip orchestral titles
  if (singleChair && !isChamber) {
    return { title: `Chair ${chairNumber}`, shortTitle: `Ch ${chairNumber}`, isLeadership: false }
  }

  // Violin 1 - Concertmaster (orchestra) or numbered violin (chamber)
  if (VIOLIN_1_PATTERNS.test(instrumentName)) {
    if (isChamber) {
      return { title: `${ordinal(chairNumber)} Violin`, shortTitle: `Vln ${chairNumber}`, isLeadership: chairNumber === 1 }
    }
    switch (chairNumber) {
      case 1:
        return { title: 'Concertmaster', shortTitle: 'CM', isLeadership: true }
      case 2:
        return { title: 'Assistant Concertmaster', shortTitle: 'Asst CM', isLeadership: true }
      default:
        return { title: `Section`, shortTitle: `Sec`, isLeadership: false }
    }
  }

  // Violin 2 - Principal Second (orchestra) or numbered violin (chamber)
  if (VIOLIN_2_PATTERNS.test(instrumentName)) {
    if (isChamber) {
      return { title: `${ordinal(chairNumber)} Violin`, shortTitle: `Vln ${chairNumber}`, isLeadership: chairNumber === 1 }
    }
    switch (chairNumber) {
      case 1:
        return { title: 'Principal 2nd Violin', shortTitle: 'Prin', isLeadership: true }
      case 2:
        return { title: 'Assistant Principal', shortTitle: 'Asst Prin', isLeadership: true }
      default:
        return { title: `Section`, shortTitle: `Sec`, isLeadership: false }
    }
  }

  // Viola
  if (VIOLA_PATTERNS.test(instrumentName)) {
    if (isChamber) {
      if (singleChair) {
        return { title: 'Viola', shortTitle: 'Vla', isLeadership: false }
      }
      return { title: `${ordinal(chairNumber)} Viola`, shortTitle: `Vla ${chairNumber}`, isLeadership: chairNumber === 1 }
    }
    switch (chairNumber) {
      case 1:
        return { title: 'Principal Viola', shortTitle: 'Prin', isLeadership: true }
      case 2:
        return { title: 'Assistant Principal', shortTitle: 'Asst Prin', isLeadership: true }
      default:
        return { title: `Section`, shortTitle: `Sec`, isLeadership: false }
    }
  }

  // Cello
  if (CELLO_PATTERNS.test(instrumentName)) {
    if (isChamber) {
      if (singleChair) {
        return { title: 'Cello', shortTitle: 'Vcl', isLeadership: false }
      }
      return { title: `${ordinal(chairNumber)} Cello`, shortTitle: `Vcl ${chairNumber}`, isLeadership: chairNumber === 1 }
    }
    switch (chairNumber) {
      case 1:
        return { title: 'Principal Cello', shortTitle: 'Prin', isLeadership: true }
      case 2:
        return { title: 'Assistant Principal', shortTitle: 'Asst Prin', isLeadership: true }
      default:
        return { title: `Section`, shortTitle: `Sec`, isLeadership: false }
    }
  }

  // Double Bass
  if (BASS_PATTERNS.test(instrumentName)) {
    if (isChamber) {
      if (singleChair) {
        return { title: 'Bass', shortTitle: 'Bs', isLeadership: false }
      }
      return { title: `${ordinal(chairNumber)} Bass`, shortTitle: `Bs ${chairNumber}`, isLeadership: chairNumber === 1 }
    }
    switch (chairNumber) {
      case 1:
        return { title: 'Principal Bass', shortTitle: 'Prin', isLeadership: true }
      case 2:
        return { title: 'Assistant Principal', shortTitle: 'Asst Prin', isLeadership: true }
      default:
        return { title: `Section`, shortTitle: `Sec`, isLeadership: false }
    }
  }

  // Harp
  if (HARP_PATTERNS.test(instrumentName)) {
    switch (chairNumber) {
      case 1:
        return { title: 'Principal Harp', shortTitle: 'Prin', isLeadership: true }
      case 2:
        return { title: '2nd Harp', shortTitle: '2nd', isLeadership: false }
      default:
        return { title: `${ordinal(chairNumber)} Harp`, shortTitle: `${chairNumber}`, isLeadership: false }
    }
  }

  // Timpani - special case in percussion
  if (TIMPANI_PATTERNS.test(instrumentName)) {
    switch (chairNumber) {
      case 1:
        return { title: 'Principal Timpani', shortTitle: 'Prin', isLeadership: true }
      default:
        return { title: `${ordinal(chairNumber)} Timpani`, shortTitle: `${chairNumber}`, isLeadership: false }
    }
  }

  // General Percussion
  if (PERCUSSION_PATTERNS.test(instrumentName) || section === 'percussion') {
    switch (chairNumber) {
      case 1:
        return { title: 'Principal Percussion', shortTitle: 'Prin', isLeadership: true }
      default:
        return { title: `Percussion ${chairNumber}`, shortTitle: `Perc ${chairNumber}`, isLeadership: false }
    }
  }

  // Winds and Brass - numbered positions
  if (WIND_BRASS_PATTERNS.test(instrumentName) || section === 'woodwinds' || section === 'brass') {
    switch (chairNumber) {
      case 1:
        return { title: `Principal`, shortTitle: 'Prin', isLeadership: true }
      case 2:
        return { title: `2nd / Assistant Principal`, shortTitle: '2nd', isLeadership: false }
      case 3:
        return { title: `3rd`, shortTitle: '3rd', isLeadership: false }
      case 4:
        return { title: `4th`, shortTitle: '4th', isLeadership: false }
      default:
        return { title: `${ordinal(chairNumber)}`, shortTitle: `${chairNumber}`, isLeadership: false }
    }
  }

  // Default fallback for other instruments
  switch (chairNumber) {
    case 1:
      return { title: 'Principal', shortTitle: 'Prin', isLeadership: true }
    case 2:
      return { title: 'Assistant Principal', shortTitle: 'Asst Prin', isLeadership: true }
    default:
      return { title: `Chair ${chairNumber}`, shortTitle: `Ch ${chairNumber}`, isLeadership: false }
  }
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

