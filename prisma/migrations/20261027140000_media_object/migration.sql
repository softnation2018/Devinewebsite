-- CreateTable
CREATE TABLE "MediaObject" (
    "key" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaObject_pkey" PRIMARY KEY ("key")
);
