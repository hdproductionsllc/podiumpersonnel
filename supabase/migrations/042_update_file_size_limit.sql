-- Increase project-files bucket size limit from 20MB to 40MB
UPDATE storage.buckets SET file_size_limit = 41943040 WHERE id = 'project-files';
