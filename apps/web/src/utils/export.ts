interface ExportMessage {
  senderType: string;
  content: string;
  createdAt: string | Date;
}

interface ExportConversation {
  title?: string | null;
  createdAt?: string | Date;
  messages: ExportMessage[];
}

function formatTimestamp(date: string | Date): string {
  return new Date(date).toISOString();
}

export function formatConversationAsMarkdown(
  conversation: ExportConversation,
  agentSlug: string,
): string {
  const title = conversation.title || "Untitled conversation";
  const lines: string[] = [
    `# ${title}`,
    `Agent: ${agentSlug}`,
    `Exported: ${new Date().toISOString()}`,
    "",
  ];

  for (const msg of conversation.messages) {
    const sender = msg.senderType === "user" ? "User" : "Agent";
    const time = formatTimestamp(msg.createdAt);
    lines.push(`**${sender}** (${time}):`);
    lines.push(msg.content);
    lines.push("");
  }

  return lines.join("\n");
}

export function formatConversationAsJSON(
  conversation: ExportConversation,
  agentSlug: string,
): string {
  return JSON.stringify(
    {
      title: conversation.title || "Untitled conversation",
      agent: agentSlug,
      exportedAt: new Date().toISOString(),
      messages: conversation.messages.map((msg) => ({
        senderType: msg.senderType,
        content: msg.content,
        createdAt: formatTimestamp(msg.createdAt),
      })),
    },
    null,
    2,
  );
}

export function downloadFile(
  content: string,
  filename: string,
  mimeType: string,
) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function makeExportFilename(
  agentSlug: string,
  title: string | null | undefined,
  format: "markdown" | "json",
): string {
  const sanitized = (title || "untitled")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const date = new Date().toISOString().split("T")[0];
  const ext = format === "markdown" ? "md" : "json";
  return `${agentSlug}_${sanitized}_${date}.${ext}`;
}
