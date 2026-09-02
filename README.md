# Z.AI Chat Exporter

A browser bookmarklet that exports a Z.AI conversation — including every
regenerated/alternate branch**, not just what's currently on screen — as a
readable Markdown transcript and a raw JSON file.

This is an unofficial, community tool. It is not affiliated with, endorsed
by, or supported by Z.AI**. It works by calling the same internal API
endpoints your browser already uses when a chat page loads, authenticated
with your own existing session. It only reads data; it never writes,
deletes, or modifies anything on the server. Because it depends on Z.AI's
internal (undocumented) API, it may stop working at any time if that API
changes.

## Why

Z.AI doesn't currently offer a built-in "export this chat" button. This
fills that gap for personal backups, migrating notes elsewhere, or just
keeping a local copy of a conversation you care about.

## Features

- Exports the **entire message tree**, including sibling branches created
  by regenerating a response (configurable — see below).
- Batches requests (50 messages at a time) with a short delay between
  batches, so it doesn't hammer the API.
- Shows a small on-screen progress indicator while it runs.
- Click the bookmarklet again mid-run to cancel.
- Produces two files per export:
  - `ZAI_chat_<chatId>_<date>.md` — human-readable transcript
  - `ZAI_chat_<chatId>_<date>.json` — full structured data
- Filenames include the chat ID so exporting multiple different chats on
  the same day won't overwrite each other.

## Installation

You need [Node.js](https://nodejs.org/) installed to build the bookmarklet
from source (this keeps the readable source and the minified output in
sync, rather than asking you to trust a pre-minified blob).

```bash
git clone https://github.com/<your-username>/zai-chat-exporter.git
cd zai-chat-exporter
npm install
npm run build
```

This writes the bookmarklet code to `dist/bookmarklet.txt`.

### Add it as a bookmark

1. Open `dist/bookmarklet.txt` and copy its entire contents.
2. Create a new bookmark in your browser (any bookmark bar works).
3. Set the bookmark's **name** to something like "Export Z.AI Chat".
4. Set the bookmark's **URL/location** to the copied text (it starts with
   `javascript:`).
5. Save.

## Usage

1. Open a Z.AI conversation in your browser (the URL should contain
   `/c/<some-id>`).
2. Click the bookmarklet.
3. Wait for it to finish — a small status box in the bottom-right corner
   shows progress. Two files will download automatically.
4. To cancel a running export, click the bookmarklet again.

## Configuration

Open `src/exporter.js` and look for:

```js
const EXPORT_ALL_BRANCHES = true;
```

- `true` (default): exports every branch in the conversation tree,
  including old/regenerated responses, in depth-first order.
- `false`: exports only the single active path of messages leading to the
  chat's current message (i.e. what you'd see on screen by default).

After changing this, re-run `npm run build` to regenerate the bookmarklet.

## Project structure

```
zai-chat-exporter/
├── src/
│   └── exporter.js     # readable, commented source (edit this)
├── build/
│   └── build.js        # minifies src/exporter.js into a bookmarklet
├── dist/
│   └── bookmarklet.txt # generated output (git-ignored, run `npm run build`)
├── package.json
├── LICENSE
└── README.md
```

## Limitations & known caveats

- Relies on undocumented internal API endpoints — expect breakage if Z.AI
  changes its backend.
- Requires you to be logged in and viewing the chat in the same browser
  tab/session the bookmarklet runs in.
- Very large conversations will take longer due to the batching delay
  (this is intentional, to be a considerate API citizen).
- Message content extraction tries several common shapes (plain string,
  array of blocks, nested objects with `text`/`content`/`value` fields).
  If Z.AI's message format differs from what's handled here, some content
  may be extracted imperfectly — check the JSON export for the raw data.

## License

MIT — see [LICENSE](LICENSE).
