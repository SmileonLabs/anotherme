import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { messagesTable } from "../../../../lib/db/src/schema/chat";

describe("chat message database invariants", () => {
  it("keeps unique server constraints for operation dedupe and room ordering", () => {
    const indexes = getTableConfig(messagesTable).indexes;
    const operationIndex = indexes.find(
      (index) =>
        index.config.name ===
        "messages_room_id_sender_id_client_message_id_unique_idx",
    );
    const sequenceIndex = indexes.find(
      (index) => index.config.name === "messages_room_id_room_seq_unique_idx",
    );

    expect(operationIndex?.config.unique).toBe(true);
    expect(sequenceIndex?.config.unique).toBe(true);
    expect(
      operationIndex?.config.columns.map((column) =>
        "name" in column ? column.name : null,
      ),
    ).toEqual(["room_id", "sender_id", "client_message_id"]);
    expect(
      sequenceIndex?.config.columns.map((column) =>
        "name" in column ? column.name : null,
      ),
    ).toEqual(["room_id", "room_seq"]);
  });
});
