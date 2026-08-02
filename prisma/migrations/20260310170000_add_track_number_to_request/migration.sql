-- Add nullable unique trackNumber to Request
ALTER TABLE "Request" ADD COLUMN "trackNumber" TEXT;
CREATE UNIQUE INDEX "Request_trackNumber_key" ON "Request"("trackNumber");
