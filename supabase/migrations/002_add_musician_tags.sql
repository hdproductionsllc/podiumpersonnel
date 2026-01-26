-- Add tags array column to musicians for ensemble/region labeling
alter table musicians add column tags text[] default '{}';

-- Create index for faster tag filtering
create index idx_musicians_tags on musicians using gin(tags);
