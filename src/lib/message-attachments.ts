import type { Prisma } from "@prisma/client";
import { verifyUploadedObject } from "@/lib/storage";

type AttachmentTarget = { messageId: string } | { directMessageId: string };

export async function attachUploadTickets(
  transaction: Prisma.TransactionClient,
  userId: string,
  ticketIds: string[],
  target: AttachmentTarget,
) {
  if (!ticketIds.length) return;
  const tickets = await transaction.uploadTicket.findMany({
    where: { id: { in: ticketIds }, userId, expiresAt: { gt: new Date() } },
  });
  if (tickets.length !== ticketIds.length) throw new Error("An uploaded file expired. Please upload it again.");

  const verified = await Promise.all(
    tickets.map(async (ticket) => ({
      ticket,
      valid: await verifyUploadedObject(ticket.storageKey, ticket.mimeType, ticket.size),
    })),
  );
  if (verified.some(({ valid }) => !valid)) {
    throw new Error("A file upload did not complete. Please upload it again.");
  }

  await transaction.messageAttachment.createMany({
    data: tickets.map((ticket) => ({
      ...target,
      uploaderId: userId,
      storageKey: ticket.storageKey,
      fileName: ticket.fileName,
      mimeType: ticket.mimeType,
      size: ticket.size,
    })),
  });
  await transaction.uploadTicket.deleteMany({ where: { id: { in: ticketIds }, userId } });
}
