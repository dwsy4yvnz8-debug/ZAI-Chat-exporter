/**
 * Z.AI Chat Exporter (bookmarklet source)
 * ----------------------------------------
 * Exports the FULL message tree of the current Z.AI chat conversation
 * (not just the visible/active branch) as both Markdown and JSON.
 *
 * This is NOT an official Z.AI tool. It works by calling the same
 * internal API endpoints your browser already uses when the chat page
 * loads, using your existing session (cookies + localStorage token).
 * It only ever reads data — it never writes, deletes, or modifies
 * anything on the server.
 *
 * HOW TO USE
 * 1. Run `npm install` then `npm run build` in this project.
 * 2. Copy the generated bookmarklet from dist/bookmarklet.txt.
 * 3. Create a new browser bookmark, paste the code as the URL.
 * 4. Open a Z.AI conversation (a URL containing /c/<chat-id>).
 * 5. Click the bookmark. Click it again at any time to cancel a
 *    running export.
 *
 * OUTPUT
 * - ZAI_chat_<chatId>_<timestamp>.md   Human-readable transcript
 * - ZAI_chat_<chatId>_<timestamp>.json Raw structured export
 *
 * NOTE ON BRANCHES: Z.AI conversations are stored as a tree (regenerated
 * responses become sibling branches). By default this script exports
 * EVERY branch it can find, in depth-first order, not just the one
 * currently displayed on screen. See EXPORT_ALL_BRANCHES below if you'd
 * rather only export the active path.
 */
(async () => {
  const NAMESPACE = "__zaiApiExporter";

  // ---- Toggle-off: if an export is already running, stop it. ----
  if (window[NAMESPACE]) {
    window[NAMESPACE].stop = true;
    window[NAMESPACE].ui?.remove();
    delete window[NAMESPACE];
    return;
  }

  // Set to false to only export the branch that is currently active
  // (i.e. the path of messages leading to the chat's `currentId`),
  // instead of every regenerated/alternate branch in the tree.
  const EXPORT_ALL_BRANCHES = true;

  const state = { stop: false, ui: null };
  window[NAMESPACE] = state;

  // ---- Figure out which chat we're looking at. ----
  const chatIdMatch = location.pathname.match(/\/c\/([^/]+)/i);
  const chatId = chatIdMatch?.[1];
  if (!chatId) {
    alert("Open a Z.AI conversation before running the exporter.");
    delete window[NAMESPACE];
    return;
  }

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // ---- Small floating status indicator, bottom-right corner. ----
  const statusBox = document.createElement("div");
  statusBox.style.cssText =
    "position:fixed;right:12px;bottom:12px;z-index:2147483647;" +
    "background:#111;color:#fff;padding:10px 14px;border-radius:8px;" +
    "font:13px system-ui,sans-serif;box-shadow:0 2px 12px #0008";
  statusBox.textContent = "Reading complete chat history…";
  document.body.appendChild(statusBox);
  state.ui = statusBox;

  const chatEndpoint = `/api/v1/chats/${encodeURIComponent(chatId)}`;
  const headers = { Accept: "application/json" };
  const token = localStorage.getItem("token");
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    // ---- 1. Fetch chat metadata (this includes a lightweight index
    //         of every message id in the tree, but not always full
    //         message bodies). ----
    const metaResponse = await fetch(chatEndpoint, {
      credentials: "include",
      headers,
    });
    if (!metaResponse.ok) {
      throw new Error(`Chat metadata request failed: HTTP ${metaResponse.status}`);
    }
    const chatData = await metaResponse.json();

    const history = chatData?.chat?.history;
    const messageIndex = history?.messages; // { id: partialMessage, ... }
    const currentId = history?.currentId;

    if (!messageIndex || typeof messageIndex !== "object") {
      throw new Error("The chat history index was not found.");
    }

    const allIds = Object.keys(messageIndex);
    const fullMessages = {}; // id -> full message object, filled in below
    const batchEndpoint = `${chatEndpoint}/messages/batch`;
    const BATCH_SIZE = 50;

    // ---- 2. Fetch full message content in batches so we don't send
    //         one request per message. ----
    for (let offset = 0; offset < allIds.length; offset += BATCH_SIZE) {
      if (state.stop) break;

      const batchIds = allIds.slice(offset, offset + BATCH_SIZE);
      const batchResponse = await fetch(batchEndpoint, {
        method: "POST",
        credentials: "include",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ ids: batchIds }),
      });
      if (!batchResponse.ok) {
        throw new Error(`Message batch request failed: HTTP ${batchResponse.status}`);
      }
      const batchJson = await batchResponse.json();
      Object.assign(fullMessages, batchJson.data || {});

      statusBox.textContent = `Downloading messages… ${Object.keys(fullMessages).length}/${allIds.length}`;
      await sleep(80); // gentle throttle, be a good API citizen
    }

    if (state.stop) {
      statusBox.remove();
      delete window[NAMESPACE];
      return;
    }

    // ---- 3. Rebuild the conversation tree from parent/child links. ----
    const getMessage = (id) => fullMessages[id] || messageIndex[id];
    const getParentId = (msg) => msg?.parentId ?? msg?.parent_id ?? null;
    const getTimestamp = (id) => getMessage(id)?.timestamp || 0;

    const childrenByParent = new Map(); // parentId -> [childId, ...]
    for (const id of allIds) {
      const parentId = getParentId(getMessage(id));
      if (parentId) {
        if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
        childrenByParent.get(parentId).push(id);
      }
    }
    // Keep sibling branches (e.g. regenerated answers) in chronological order.
    for (const [, childIds] of childrenByParent) {
      childIds.sort((a, b) => getTimestamp(a) - getTimestamp(b));
    }

    const rootIds = allIds.filter((id) => !getParentId(getMessage(id)));

    // ---- 4. Walk the tree depth-first to produce a linear transcript. ----
    const visitOrder = [];
    const visited = new Set();
    const MAX_DEPTH = 10000; // guard against pathological/cyclic data

    function visit(id, depth = 0) {
      if (visited.has(id) || depth > MAX_DEPTH) return;
      visited.add(id);
      visitOrder.push(id);
      for (const childId of childrenByParent.get(id) || []) {
        visit(childId, depth + 1);
      }
    }

    if (EXPORT_ALL_BRANCHES) {
      rootIds.forEach((id) => visit(id));
      allIds.forEach((id) => visit(id)); // catch any orphaned messages
    } else {
      // Only the path of ancestors leading to currentId, root to leaf.
      const activePath = [];
      let cursor = currentId;
      const seen = new Set();
      while (cursor && !seen.has(cursor)) {
        seen.add(cursor);
        activePath.unshift(cursor);
        cursor = getParentId(getMessage(cursor));
      }
      activePath.forEach((id) => visit(id));
    }

    // ---- 5. Extract readable text from whatever shape a message's
    //         content happens to be (string, array of blocks, etc). ----
    function extractText(value) {
      if (value == null) return "";
      if (typeof value === "string") return value;
      if (Array.isArray(value)) {
        return value.map(extractText).filter(Boolean).join("\n");
      }
      if (typeof value === "object") {
        for (const key of ["text", "content", "value", "output", "thought"]) {
          if (typeof value[key] === "string" && value[key].trim()) return value[key];
        }
        return Object.values(value).map(extractText).filter(Boolean).join("\n");
      }
      return String(value);
    }

    function messageText(msg) {
      const fromContent = extractText(msg.content).trim();
      if (fromContent) return fromContent;
      return extractText(msg.content_blocks).trim();
    }

    function roleLabel(role) {
      if (role === "user") return "User";
      if (role === "assistant") return "Assistant";
      return role || "Unknown";
    }

    // ---- 6. Build the Markdown transcript. ----
    const mdLines = [
      `# Z.AI conversation ${chatId}`,
      "",
      `Exported: ${new Date().toISOString()}`,
      `Messages: ${visitOrder.length}`,
      `Branches: ${EXPORT_ALL_BRANCHES ? "all" : "active only"}`,
      "",
    ];

    for (const id of visitOrder) {
      const msg = getMessage(id);
      mdLines.push(`## ${roleLabel(msg.role)}`, "");
      mdLines.push(messageText(msg) || "[No text content returned]", "");
      if (msg.files?.length) {
        mdLines.push(`Attachments: ${JSON.stringify(msg.files)}`, "");
      }
      mdLines.push("----------------------------------------", "");
    }

    const markdownOutput = mdLines.join("\n");

    // ---- 7. Build the raw JSON export. ----
    const jsonOutput = {
      chatId,
      title: chatData.title || "",
      currentId,
      exportedAllBranches: EXPORT_ALL_BRANCHES,
      exportedAt: new Date().toISOString(),
      messageCount: visitOrder.length,
      messages: visitOrder.map((id) => getMessage(id)),
    };

    // ---- 8. Trigger the two file downloads. ----
    function downloadFile(filename, content, mimeType) {
      const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
    }

    // Date + chat id keeps filenames unique across days *and* chats,
    // so repeated exports don't silently overwrite each other.
    const dateStamp = new Date().toISOString().slice(0, 10);
    const safeChatId = chatId.replace(/[^a-z0-9_-]/gi, "").slice(0, 24);
    const baseName = `ZAI_chat_${safeChatId}_${dateStamp}`;

    downloadFile(`${baseName}.md`, markdownOutput, "text/markdown;charset=utf-8");
    await sleep(250); // let the first download dialog settle before the next
    downloadFile(`${baseName}.json`, JSON.stringify(jsonOutput, null, 2), "application/json;charset=utf-8");

    statusBox.remove();
    delete window[NAMESPACE];
    alert(`Finished. Retrieved ${visitOrder.length} messages from the Z.AI history API.`);
  } catch (err) {
    console.error("Z.AI API exporter:", err);
    statusBox.remove();
    delete window[NAMESPACE];
    alert(`Export failed: ${err.message}`);
  }
})();
