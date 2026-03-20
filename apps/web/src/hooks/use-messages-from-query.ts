import { useEffect } from "react";

interface ChatMessage {
  id: string;
  content: string;
  senderType: string;
  createdAt: string | Date;
  pending?: boolean;
  error?: boolean;
}

/**
 * Initializes local messages state from a query result whenever it changes.
 * Also sets the cursor for pagination and detects if the agent is still working.
 */
export function useMessagesFromQuery(
  queryData: unknown,
  setLocalMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  setNextCursor: React.Dispatch<React.SetStateAction<string | null>>,
  setSending: React.Dispatch<React.SetStateAction<boolean>>,
) {
  useEffect(() => {
    if (queryData) {
      const data = queryData as {
        items: ChatMessage[];
        nextCursor: string | null;
      };
      const msgs = data.items.slice().reverse();
      setLocalMessages(msgs);
      setNextCursor(data.nextCursor);
      const last = msgs[msgs.length - 1];
      setSending(last?.senderType === "user");
    }
  }, [queryData, setLocalMessages, setNextCursor, setSending]);
}
