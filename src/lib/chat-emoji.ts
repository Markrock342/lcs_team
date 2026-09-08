export const CHAT_EMOJI_GROUPS = [
  {
    label: "รีแอค",
    items: ["👍", "❤️", "😂", "🎉", "👀", "✅", "🔥", "🙏"],
  },
  {
    label: "หน้า",
    items: ["😀", "😅", "😊", "😍", "🤔", "😎", "😭", "😡"],
  },
  {
    label: "งาน",
    items: ["📌", "📎", "💡", "⚠️", "🚀", "🛠️", "📝", "☕"],
  },
] as const;

export const QUICK_EMOJIS = CHAT_EMOJI_GROUPS[0].items;
