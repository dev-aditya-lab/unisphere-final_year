import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { admin, cleanupUsers, createUser } from "../helpers/supabase.js";

/**
 * The database side of the local-first messaging client (migration 20260123000029), with real sessions:
 * atomic and idempotent send, who may read/send, attachments, pages in both directions and the inbox/header RPCs.
 */

let a, b, c, conv;
const op = () => crypto.randomUUID();
const send = (who, body, { files = [], key = op(), conversation = conv } = {}) =>
  who.client.rpc("send_message", { p_conversation: conversation, p_body: body, p_file_ids: files, p_client_op_id: key });

beforeAll(async () => {
  a = await createUser("mlf-a");
  b = await createUser("mlf-b");
  c = await createUser("mlf-c");
  await admin.from("profiles").update({ allow_messages_from: "everyone" }).in("id", [a.id, b.id, c.id]);
  conv = (await a.client.rpc("start_direct_conversation", { p_other: b.id })).data;
});
afterAll(cleanupUsers);

describe("send_message", () => {
  it("stores one message per key, however many times the send is repeated", async () => {
    const key = op();
    const first = await send(a, "once only", { key });
    expect(first.error).toBeNull();
    expect(first.data.replayed).toBe(false);
    const again = await send(a, "once only", { key });
    expect(again.error).toBeNull();
    expect(again.data.replayed).toBe(true);
    expect(again.data.message.id).toBe(first.data.message.id);
    const { data: rows } = await admin.from("messages").select("id").eq("sender_id", a.id).eq("client_op_id", key);
    expect(rows).toHaveLength(1);
  });

  it("is safe under a burst of identical concurrent sends (two tabs, a retry racing the original)", async () => {
    const key = op();
    const results = await Promise.all(Array.from({ length: 6 }, () => send(a, "racing", { key })));
    expect(results.every((r) => r.error === null)).toBe(true);
    expect(new Set(results.map((r) => r.data.message.id)).size).toBe(1);
    const { data: rows } = await admin.from("messages").select("id").eq("client_op_id", key);
    expect(rows).toHaveLength(1);
  });

  it("answers a repeat even after the conversation was closed to the sender", async () => {
    const key = op();
    expect((await send(a, "before the block", { key })).error).toBeNull();
    await b.client.rpc("block_user", { p_target: a.id });
    expect((await send(a, "after the block")).error?.message).toContain("cannot_send");
    const replay = await send(a, "before the block", { key });
    expect(replay.error).toBeNull();
    expect(replay.data.replayed).toBe(true);
    await b.client.rpc("unblock_user", { p_target: a.id });
    await admin.from("profiles").update({ allow_messages_from: "everyone" }).in("id", [a.id, b.id]);
  });

  it("refuses strangers, forged senders, empty and oversized bodies", async () => {
    expect((await send(c, "let me in")).error?.message).toContain("cannot_send");
    expect((await send(a, "   ")).error?.message).toContain("empty_message");
    expect((await send(a, "x".repeat(4001))).error?.message).toContain("empty_message");
    // no way to pick the sender: it is always the caller
    const ok = await send(a, "who am I");
    expect(ok.data.message.sender_id).toBe(a.id);
    const noSession = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
    expect((await noSession.rpc("send_message", { p_conversation: conv, p_body: "hi", p_file_ids: [], p_client_op_id: op() })).error).not.toBeNull();
  });

  it("attaches only the caller's own ready files, atomically, and snapshots them on the message", async () => {
    const mk = async (owner, over = {}) =>
      (
        await admin
          .from("files")
          .insert({ owner_id: owner.id, bucket: "private", storage_key: `message_attachment/${owner.id}/${crypto.randomUUID()}.png`, purpose: "message_attachment", mime_type: "image/png", size_bytes: 10, status: "ready", original_name: "pic.png", ...over })
          .select("id")
          .single()
      ).data.id;
    const mine = await mk(a);
    const theirs = await mk(b);
    const pending = await mk(a, { status: "pending" });

    const good = await send(a, "", { files: [mine] });
    expect(good.error).toBeNull();
    expect(good.data.message.attachments).toEqual([expect.objectContaining({ id: mine, original_name: "pic.png", mime_type: "image/png" })]);
    // the recipient may open it; a non-member may not
    expect((await b.client.from("files").select("id").eq("id", mine)).data).toHaveLength(1);
    expect((await c.client.from("files").select("id").eq("id", mine)).data).toHaveLength(0);

    const before = (await admin.from("messages").select("id", { count: "exact", head: true }).eq("conversation_id", conv)).count;
    expect((await send(a, "stolen", { files: [theirs] })).error?.message).toContain("invalid_file");
    expect((await send(a, "not ready", { files: [pending] })).error?.message).toContain("invalid_file");
    const after = (await admin.from("messages").select("id", { count: "exact", head: true }).eq("conversation_id", conv)).count;
    expect(after).toBe(before); // a refused attachment leaves no half-sent message behind
  });

  it("limits a member to 30 messages a minute", async () => {
    const x = await createUser("mlf-burst");
    await admin.from("profiles").update({ allow_messages_from: "everyone" }).eq("id", x.id);
    const id = (await x.client.rpc("start_direct_conversation", { p_other: b.id })).data;
    let limited = 0;
    for (let i = 0; i < 33; i++) {
      const r = await x.client.rpc("send_message", { p_conversation: id, p_body: `m${i}`, p_file_ids: [], p_client_op_id: op() });
      if (r.error?.message.includes("rate_limited")) limited += 1;
    }
    expect(limited).toBe(3);
  });
});

describe("reading", () => {
  it("pages forwards and backwards by cursor without gaps or repeats", async () => {
    const x = await createUser("mlf-pages");
    await admin.from("profiles").update({ allow_messages_from: "everyone" }).eq("id", x.id);
    const id = (await x.client.rpc("start_direct_conversation", { p_other: c.id })).data;
    const rows = Array.from({ length: 25 }, (_, i) => ({ conversation_id: id, sender_id: x.id, body: `m${i + 1}`, created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString() }));
    expect((await admin.from("messages").insert(rows)).error).toBeNull();

    const newest = (await x.client.rpc("conversation_messages", { p_conv: id, p_limit: 10 })).data;
    expect(newest.map((m) => m.body)).toEqual(Array.from({ length: 10 }, (_, i) => `m${25 - i}`));
    const oldestOfPage = newest.at(-1);
    const older = (await x.client.rpc("conversation_messages", { p_conv: id, p_before_ts: oldestOfPage.created_at, p_before_id: oldestOfPage.id, p_limit: 10 })).data;
    expect(older.map((m) => m.body)).toEqual(Array.from({ length: 10 }, (_, i) => `m${15 - i}`));

    const first = (await x.client.rpc("conversation_messages", { p_conv: id, p_limit: 100 })).data.at(-1);
    const forward = (await x.client.rpc("conversation_messages", { p_conv: id, p_after_ts: first.created_at, p_after_id: first.id, p_limit: 5 })).data;
    expect(forward.map((m) => m.body)).toEqual(["m2", "m3", "m4", "m5", "m6"]);
  });

  it("shows a non-member nothing, and the same answer as for a conversation that does not exist", async () => {
    expect((await c.client.rpc("conversation_messages", { p_conv: conv })).data).toEqual([]);
    expect((await c.client.rpc("conversation_header", { p_conv: conv })).data).toEqual([]);
    expect((await c.client.rpc("conversation_header", { p_conv: crypto.randomUUID() })).data).toEqual([]);
  });

  it("returns the inbox in one call with the other person, the unread count and both read positions", async () => {
    await send(a, "ping for the inbox");
    const inbox = (await b.client.rpc("inbox_conversations")).data;
    const row = inbox.find((r) => r.conversation_id === conv);
    expect(row.other_user_id).toBe(a.id);
    expect(row.other_full_name).toBe("Test mlf-a");
    expect(Number(row.unread)).toBeGreaterThan(0);
    expect(inbox.every((r) => r.other_user_id !== b.id)).toBe(true);
    // someone with no conversations sees none: no leakage through the function
    const nobody = await createUser("mlf-none");
    expect((await nobody.client.rpc("inbox_conversations")).data).toEqual([]);

    const header = (await b.client.rpc("conversation_header", { p_conv: conv })).data[0];
    expect(header.can_send).toBe(true);
    await b.client.rpc("mark_conversation_read", { p_conv: conv });
    expect(Number((await b.client.rpc("inbox_conversations")).data.find((r) => r.conversation_id === conv).unread)).toBe(0);
  });

  it("drops text and attachment snapshot when a message is deleted", async () => {
    const file = (
      await admin
        .from("files")
        .insert({ owner_id: a.id, bucket: "private", storage_key: `message_attachment/${a.id}/${crypto.randomUUID()}.png`, purpose: "message_attachment", mime_type: "image/png", size_bytes: 10, status: "ready", original_name: "gone.png" })
        .select("id")
        .single()
    ).data.id;
    const sent = (await send(a, "secret words", { files: [file] })).data.message;
    expect((await a.client.from("messages").update({ status: "deleted" }).eq("id", sent.id)).error).toBeNull();
    const row = (await b.client.from("messages").select("body, status, attachments").eq("id", sent.id).single()).data;
    expect(row).toEqual({ body: "", status: "deleted", attachments: [] });
  });
});

describe("typing indicators", () => {
  // A private broadcast channel: only the conversation's two members may join it or hear it.
  const join = (who, topic) =>
    new Promise((resolve) => {
      const events = [];
      const channel = who.client.channel(topic, { config: { private: true, broadcast: { self: false } } });
      channel.on("broadcast", { event: "typing" }, (p) => events.push(p.payload));
      const timer = setTimeout(() => resolve({ status: "TIMEOUT", channel, events }), 8000);
      channel.subscribe((status, err) => {
        if (["SUBSCRIBED", "CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) {
          clearTimeout(timer);
          resolve({ status, channel, events, err });
        }
      });
    });

  it("lets a member join and hear the other member, and refuses an outsider", async () => {
    await a.client.realtime.setAuth((await a.client.auth.getSession()).data.session.access_token);
    await b.client.realtime.setAuth((await b.client.auth.getSession()).data.session.access_token);
    await c.client.realtime.setAuth((await c.client.auth.getSession()).data.session.access_token);

    const topic = `typing:${conv}`;
    const [mine, theirs, outsider] = await Promise.all([join(a, topic), join(b, topic), join(c, topic)]);
    try {
      expect(mine.status).toBe("SUBSCRIBED");
      expect(theirs.status).toBe("SUBSCRIBED");
      expect(outsider.status).not.toBe("SUBSCRIBED");

      await mine.channel.send({ type: "broadcast", event: "typing", payload: { userId: a.id } });
      await new Promise((r) => setTimeout(r, 1500));
      expect(theirs.events).toEqual([{ userId: a.id }]);
    } finally {
      await Promise.all([a, b, c].map((u) => u.client.removeAllChannels()));
    }
  }, 30_000);
});
