-- Fix venue Google Maps URLs to use the official Maps URLs API format.
-- Old format: /maps/place/?q=place_id:XXXX (undocumented, unreliable)
-- New format: /maps/search/?api=1&query=NAME,ADDRESS&query_place_id=XXXX (official)
--
-- This updates venues that have a google_place_id and the old-style URL.
-- The query param uses name + address for a human-readable fallback.

UPDATE venues
SET google_maps_url =
  'https://www.google.com/maps/search/?api=1&query=' ||
  replace(
    replace(
      concat_ws(', ',
        NULLIF(name, ''),
        NULLIF(address, ''),
        NULLIF(city, ''),
        NULLIF(state, ''),
        NULLIF(zip, '')
      ),
      ' ', '+'
    ),
    ',', '%2C'
  ) ||
  '&query_place_id=' || google_place_id
WHERE google_place_id IS NOT NULL
  AND google_maps_url LIKE '%/maps/place/?q=place_id:%';
