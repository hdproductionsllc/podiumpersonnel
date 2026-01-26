-- Zip code coordinates for distance calculation
-- This table will be populated with US zip code data
CREATE TABLE zip_coordinates (
  zip VARCHAR(10) PRIMARY KEY,
  lat DECIMAL(9,6) NOT NULL,
  lng DECIMAL(9,6) NOT NULL
);

-- Common California zip codes for initial testing
-- Full dataset should be imported from public US zip code data
INSERT INTO zip_coordinates (zip, lat, lng) VALUES
  -- Los Angeles area
  ('90210', 34.0901, -118.4065),  -- Beverly Hills
  ('90001', 33.9425, -118.2551),  -- Los Angeles
  ('90012', 34.0622, -118.2428),  -- Downtown LA
  ('90028', 34.1016, -118.3267),  -- Hollywood
  ('90291', 33.9925, -118.4695),  -- Venice
  ('90401', 34.0195, -118.4912),  -- Santa Monica
  ('91101', 34.1478, -118.1445),  -- Pasadena
  ('91301', 34.1361, -118.7598),  -- Agoura Hills
  ('91302', 34.1478, -118.6298),  -- Calabasas
  ('91364', 34.1581, -118.5590),  -- Woodland Hills
  ('91401', 34.1826, -118.4490),  -- Van Nuys
  ('91505', 34.1808, -118.3090),  -- Burbank
  ('91601', 34.1670, -118.3760),  -- North Hollywood
  -- Orange County
  ('92602', 33.7175, -117.7950),  -- Irvine
  ('92801', 33.8366, -117.9143),  -- Anaheim
  ('92660', 33.6189, -117.9298),  -- Newport Beach
  -- San Diego area
  ('92101', 32.7195, -117.1628),  -- San Diego Downtown
  ('92037', 32.8328, -117.2713),  -- La Jolla
  -- Santa Barbara
  ('93101', 34.4208, -119.6982),  -- Santa Barbara
  ('93103', 34.4358, -119.7143),  -- Santa Barbara
  -- Palm Springs area
  ('92262', 33.8303, -116.5453),  -- Palm Springs
  ('92264', 33.7872, -116.4958),  -- Palm Springs
  -- Ventura County
  ('93001', 34.2805, -119.2945),  -- Ventura
  ('91320', 34.1789, -118.8765),  -- Newbury Park
  ('91360', 34.1956, -118.8756),  -- Thousand Oaks
  -- Central Coast
  ('93401', 35.2828, -120.6596),  -- San Luis Obispo
  -- Bay Area (for future expansion)
  ('94102', 37.7749, -122.4194),  -- San Francisco
  ('94301', 37.4419, -122.1430),  -- Palo Alto
  ('95101', 37.3382, -121.8863);  -- San Jose
