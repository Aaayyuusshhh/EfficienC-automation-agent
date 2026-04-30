import { notion } from "./notionClient.js";

export async function createNotionTask({ title, due }) {
  try {
    await notion.pages.create({
      parent: {
        database_id: process.env.NOTION_DATABASE_ID,
      },
      properties: {
        Name: {
          title: [{ text: { content: title } }],
        },
        ...(due && {
          Due: {
            date: { start: due },
          },
        }),
        Status: {
          select: { name: "pending" },
        },
      },
    });
    console.log("[NOTION] Task added:", title);
  } catch (err) {
    console.error("[NOTION ERROR]", err.message);
  }
}

export async function markTaskInProgress(title) {
  try {
    console.log("[NOTION DEBUG] Searching for:", title);

    const response = await notion.search({
      filter: {
        property: "object",
        value: "page",
      },
    });

    const page = response.results.find(p =>
      p.properties.Name?.title[0]?.plain_text
        ?.toLowerCase()
        .includes(title.toLowerCase())
    );

    if (!page) {
      console.log("[NOTION DEBUG] No match found for:", title);
      return;
    }

    const pageId = page.id;
    console.log("[NOTION DEBUG] Matched:", page.properties.Name.title[0]?.plain_text);

    await notion.pages.update({
      page_id: pageId,
      properties: {
        Status: { select: { name: "in_progress" } },
      },
    });

    console.log("[NOTION] Task in progress:", title);
  } catch (err) {
    console.error("[NOTION ERROR]", err.message);
  }
}

export async function updateNotionTaskStatus(title) {
  try {
    const response = await notion.search({
      filter: {
        property: "object",
        value: "page",
      },
    });

    const page = response.results.find(p =>
      p.properties?.Name?.title?.[0]?.plain_text
        ?.toLowerCase()
        .includes(title.toLowerCase())
    );

    if (!page) return;

    const pageId = page.id;

    await notion.pages.update({
      page_id: pageId,
      properties: {
        Status: { select: { name: "completed" } },
      },
    });

    console.log("[NOTION] Task marked completed:", title);
  } catch (err) {
    console.error("[NOTION UPDATE ERROR]", err.message);
  }
}
