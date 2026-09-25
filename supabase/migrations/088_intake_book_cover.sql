-- 088: A custom first page for the books
--
-- Every book opens with a playlist page the app generates. The owner sometimes
-- has their own (a designed cover, a hand-edited run sheet) and wants THAT to
-- open every book instead. One cover per intake, used by every book.
--
-- The PDF itself lives in the project-files storage bucket under the usual
-- '<orgId>/<projectId>/<uuid>.pdf' key (minted by files/upload-url, so the
-- 085 storage policies already scope it to the org). It is deliberately NOT a
-- project_files row: those are what Send Music delivers to musicians, and the
-- cover only ever reaches them inside a book.
--
-- NULL = use the generated playlist page (the default, and the state of every
-- existing intake).

ALTER TABLE intakes
  ADD COLUMN IF NOT EXISTS book_cover_path TEXT,
  ADD COLUMN IF NOT EXISTS book_cover_name TEXT;

COMMENT ON COLUMN intakes.book_cover_path IS
  'project-files storage key of the owner''s own first page for every book; NULL = generated playlist page.';
COMMENT ON COLUMN intakes.book_cover_name IS
  'Original filename of book_cover_path, for display.';
