-- Backfill google_maps_url for venues that have address data but no maps URL.
-- Uses address-based search URL. The browser handles URL encoding of spaces/commas.
UPDATE venues
SET google_maps_url = 'https://www.google.com/maps/search/?api=1&query=' ||
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
  )
WHERE google_maps_url IS NULL
  AND (address IS NOT NULL OR city IS NOT NULL);
