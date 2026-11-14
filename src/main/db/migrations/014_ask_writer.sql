-- Ask (Plan AG1 review): what wrote a turn's transcript, as "kind model mode". A provider row's id
-- is reused after a removal and kept across an edit, so it cannot say whether the transcript fits
-- the provider asking now; rows from before this migration are read as text.
ALTER TABLE ask_messages ADD COLUMN writer TEXT;
