/**
 * Spotify ranking tests — the "no weird cover versions" rule. The original
 * recording must outrank karaoke/tribute/cover releases even when Spotify's
 * raw search order puts them first.
 */
import { describe, it, expect } from 'vitest'
import { rankTracks, scoreTrack, titleAgrees, type RawTrack } from '../spotify-ranking'

function track(
  name: string,
  artist: string,
  popularity: number,
  album = 'Album',
  albumType = 'album'
): RawTrack {
  return {
    uri: `spotify:track:${name.replace(/\W/g, '')}${artist.replace(/\W/g, '')}`,
    name,
    duration_ms: 180000,
    popularity,
    artists: [{ name: artist }],
    album: { name: album, images: [], album_type: albumType },
  }
}

describe('scoreTrack / rankTracks', () => {
  it('the original artist beats a more-popular cover when the client named the artist', () => {
    const original = track('My Girl', 'The Temptations', 70)
    const cover = track('My Girl', 'Some Wedding Band', 85)
    const ranked = rankTracks([cover, original], 'The Temptations', 5)
    expect(ranked[0].artists).toBe('The Temptations')
  })

  it('karaoke and tribute releases are buried regardless of popularity', () => {
    const original = track('September', 'Earth, Wind & Fire', 60)
    const karaoke = track('September (Karaoke Version)', 'Karaoke Hits', 90)
    const tribute = track('September', 'Tribute Stars', 88, 'Made Famous By Earth Wind & Fire')
    const ranked = rankTracks([karaoke, tribute, original], 'Earth, Wind & Fire', 5)
    expect(ranked[0].artists).toBe('Earth, Wind & Fire')
    expect(ranked[0].name).toBe('September')
  })

  it('instrumental / string-quartet re-recordings rank below the original', () => {
    const original = track('Unchained Melody', 'The Righteous Brothers', 75)
    const quartet = track('Unchained Melody (String Quartet Version)', 'Wedding Strings Co', 80)
    const ranked = rankTracks([quartet, original], 'Righteous Brothers', 5)
    expect(ranked[0].artists).toBe('The Righteous Brothers')
  })

  it('partial artist names still agree ("Righteous Brothers" ~ "The Righteous Brothers")', () => {
    const t = track('Unchained Melody', 'The Righteous Brothers', 75)
    expect(scoreTrack(t, 'Righteous Brothers')).toBeGreaterThan(scoreTrack(t, 'Elvis Presley'))
  })

  it('without a named artist, popularity leads (original recordings dominate it)', () => {
    const original = track('Canon in D', 'Berlin Philharmonic', 80)
    const musicBox = track('Canon in D (Music Box Lullaby)', 'Baby Sleep Co', 85)
    const ranked = rankTracks([musicBox, original], null, 5)
    expect(ranked[0].artists).toBe('Berlin Philharmonic')
  })

  it('live cuts rank below the studio version by the same artist', () => {
    const studio = track('Something', 'The Beatles', 70)
    const live = track('Something - Live at the Hollywood Bowl', 'The Beatles', 70)
    const ranked = rankTracks([live, studio], 'Beatles', 5)
    expect(ranked[0].name).toBe('Something')
  })
})

// Real failures from an auto-built playlist (2026-09-25): Spotify pads each
// search with unrelated popular tracks, and ranking on popularity shipped them.
describe('title agreement', () => {
  it('a padding hit never beats the song, however popular', () => {
    const song = track('Till There Was You - Remastered 2009', 'The Beatles', 67)
    const padding = track('Bones', 'Imagine Dragons', 83)
    const ranked = rankTracks([padding, song], null, 5, 'Til There Was You')
    expect(ranked[0].name).toBe('Till There Was You - Remastered 2009')
    expect(ranked[0].titleMatch).toBe(true)
    expect(ranked[1].titleMatch).toBe(false)
  })

  it('the wrong song by the right artist loses to the right song', () => {
    const right = track('Rolling in the Deep', 'Adele', 70)
    const wrong = track('Set Fire to the Rain', 'Adele', 88)
    expect(rankTracks([wrong, right], 'Adele', 5, 'Rolling In The Deep')[0].name).toBe('Rolling in the Deep')
  })

  it('titles agree across spelling, version tags and features', () => {
    expect(titleAgrees('Any Way You Want It', 'Anyway You Want It')).toBe(true)
    expect(titleAgrees("Isn't She Lovely", 'Isn’t She Lovely')).toBe(true)
    expect(titleAgrees('Havana (feat. Young Thug)', 'Havana')).toBe(true)
    expect(titleAgrees('Bitter Sweet Symphony - Remastered 2016', 'Bittersweet Symphony')).toBe(true)
    expect(titleAgrees('Symphony No. 9: IV. Ode to Joy', 'Ode to Joy')).toBe(true)
  })

  it('different songs do not agree', () => {
    expect(titleAgrees('Just the Way You Are', 'Marry You')).toBe(false)
    expect(titleAgrees('Gasolina', 'Despacito')).toBe(false)
    expect(titleAgrees('Love On The Brain', 'All You Need Is Love')).toBe(false)
    expect(titleAgrees('Lava', 'Grow Old With You')).toBe(false)
    // Too short to trust containment: "Love" is inside a thousand titles.
    expect(titleAgrees('Love Story', 'Love')).toBe(false)
  })
})

