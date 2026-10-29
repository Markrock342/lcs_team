-- Per-user, per-conversation settings; never changes other members' notifications.
CREATE TABLE IF NOT EXISTS public.chat_notification_preferences (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  mute_forever boolean NOT NULL DEFAULT false,
  muted_until timestamptz,
  PRIMARY KEY (user_id, channel_id)
);
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS silent boolean NOT NULL DEFAULT false;
