DELETE FROM tracked_routes
WHERE line LIKE 'de:nrw.de:%'
  AND EXISTS (
    SELECT 1
    FROM tracked_routes existing
    WHERE existing.station_eva_id = tracked_routes.station_eva_id
      AND existing.origin = tracked_routes.origin
      AND existing.destination = tracked_routes.destination
      AND UPPER(existing.line) = UPPER(REPLACE(tracked_routes.line, 'de:nrw.de:', ''))
  );

UPDATE tracked_routes
SET line = UPPER(REPLACE(line, 'de:nrw.de:', ''))
WHERE line LIKE 'de:nrw.de:%';
