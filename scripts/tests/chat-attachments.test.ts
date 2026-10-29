import assert from "node:assert/strict";
import test from "node:test";
import { chatAttachmentError, MAX_CHAT_FILE_BYTES } from "../../src/lib/chat-attachments.ts";

test("attachments accept one file up to the configured 50 MB storage limit", () => {
  assert.equal(chatAttachmentError([{ name: "photo.png", size: 1024 }]), null);
  assert.equal(chatAttachmentError([{ name: "archive.zip", size: MAX_CHAT_FILE_BYTES }]), null);
  assert.match(chatAttachmentError([{ name: "too-large.zip", size: MAX_CHAT_FILE_BYTES + 1 }])!, /50 MB/);
});

test("multiple dropped files are rejected explicitly instead of silently discarding attachments", () => {
  assert.match(chatAttachmentError([{ name: "a.pdf", size: 10 }, { name: "b.pdf", size: 10 }])!, /ครั้งละ 1/);
  assert.equal(chatAttachmentError([]), null);
});
