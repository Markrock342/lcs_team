export type ChatMutePreference = {
    mute_forever?: boolean | null;
    muted_until?: string | null;
};
export const CHAT_MUTE_DURATIONS = [
    { value: 15, label: "15 นาที" }, { value: 60, label: "1 ชั่วโมง" },
    { value: 480, label: "8 ชั่วโมง" }, { value: 1440, label: "24 ชั่วโมง" },
    { value: "forever", label: "จนกว่าจะเปิดเอง" },
] as const;
export function isChatMuted(preference: ChatMutePreference, now = Date.now()): boolean {
    return preference.mute_forever === true || Date.parse(preference.muted_until ?? "") > now;
}
export function chatMuteLabel(preference: ChatMutePreference, now = Date.now()): string {
    if (!isChatMuted(preference, now))
        return "เปิดแจ้งเตือนอยู่";
    if (preference.mute_forever)
        return "ปิดแจ้งเตือนจนกว่าจะเปิดเอง";
    return `ปิดแจ้งเตือนถึง ${new Intl.DateTimeFormat("th-TH", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(new Date(preference.muted_until!))}`;
}
