-- Pliki > 2 GB (np. 3347592417 B z OneDrive) przekraczaly zakres INT4.
ALTER TABLE "drive_files" ALTER COLUMN "size" SET DATA TYPE DOUBLE PRECISION;
ALTER TABLE "process_nodes" ALTER COLUMN "fileSize" SET DATA TYPE DOUBLE PRECISION;
