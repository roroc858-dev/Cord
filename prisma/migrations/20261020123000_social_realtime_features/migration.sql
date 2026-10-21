ALTER TABLE "DirectConversation"
ADD COLUMN "conversationKey" TEXT;

CREATE UNIQUE INDEX "DirectConversation_conversationKey_key"
ON "DirectConversation"("conversationKey");

ALTER TABLE "ConversationMember"
ADD COLUMN "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "ConversationMember_userId_joinedAt_idx"
ON "ConversationMember"("userId", "joinedAt");

CREATE TABLE "DirectMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" VARCHAR(4000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "DirectMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DirectMessage_conversationId_createdAt_idx"
ON "DirectMessage"("conversationId", "createdAt" DESC);

CREATE INDEX "DirectMessage_authorId_createdAt_idx"
ON "DirectMessage"("authorId", "createdAt" DESC);

ALTER TABLE "MessageAttachment"
ALTER COLUMN "messageId" DROP NOT NULL;

ALTER TABLE "MessageAttachment"
ADD COLUMN "directMessageId" TEXT;

CREATE INDEX "MessageAttachment_directMessageId_idx"
ON "MessageAttachment"("directMessageId");

CREATE TABLE "UploadTicket" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UploadTicket_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UploadTicket_storageKey_key"
ON "UploadTicket"("storageKey");

CREATE INDEX "UploadTicket_userId_expiresAt_idx"
ON "UploadTicket"("userId", "expiresAt");

ALTER TABLE "DirectMessage"
ADD CONSTRAINT "DirectMessage_conversationId_fkey"
FOREIGN KEY ("conversationId") REFERENCES "DirectConversation"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DirectMessage"
ADD CONSTRAINT "DirectMessage_authorId_fkey"
FOREIGN KEY ("authorId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MessageAttachment"
ADD CONSTRAINT "MessageAttachment_directMessageId_fkey"
FOREIGN KEY ("directMessageId") REFERENCES "DirectMessage"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UploadTicket"
ADD CONSTRAINT "UploadTicket_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
