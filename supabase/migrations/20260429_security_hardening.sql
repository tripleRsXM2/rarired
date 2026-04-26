-- 20260429_security_hardening.sql
--
-- Pre-launch security hardening pass.
--
-- 1. Privacy-aware visibility on feed_likes / feed_comments. The previous
--    SELECT policies were USING(true) which leaked likes & comments on
--    private profiles to anyone authenticated. Now the policy mirrors
--    profiles.privacy: public profiles are visible to all authenticated
--    users, friends-only profiles only to confirmed friends, and private
--    profiles only to the owner / match opponent.
--
-- 2. Tighten match_history.UPDATE so only the row OWNER may update
--    directly. The old policy let opponents UPDATE any column — only
--    the SECURITY DEFINER RPCs (confirm_match_and_update_stats,
--    propose_match_correction, etc.) are supposed to write opponent
--    actions. Direct opponent UPDATEs from the client are now rejected
--    by RLS; the legitimate "tag accept/reject" flow is moved into a
--    new SECURITY DEFINER RPC `respond_to_match_tag`.
--
-- 3. Rate-limit `emit_notification` (one user creating many notifications
--    for another in a short window) and `create_match_invite` (spam-
--    inviting strangers off the same match). Limits are conservative
--    and easy to relax later if they bite real users.
--
-- All changes are idempotent (DROP IF EXISTS / CREATE OR REPLACE).

------------------------------------------------------------
-- 1. feed_likes / feed_comments — privacy-aware SELECT
------------------------------------------------------------
DROP POLICY IF EXISTS likes_select ON public.feed_likes;
CREATE POLICY likes_select
  ON public.feed_likes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.match_history mh
      LEFT JOIN public.profiles p ON p.id = mh.user_id
      WHERE mh.id = feed_likes.match_id
        AND (
          -- The viewer is one of the match parties.
          mh.user_id     = auth.uid()
          OR mh.opponent_id = auth.uid()
          -- The match owner's profile is public.
          OR COALESCE(p.privacy, 'public') = 'public'
          -- The match owner's profile is friends-only AND viewer is a confirmed friend.
          OR (
            COALESCE(p.privacy, 'public') = 'friends'
            AND EXISTS (
              SELECT 1 FROM public.friend_requests fr
              WHERE fr.status = 'accepted'
                AND ((fr.sender_id   = auth.uid() AND fr.receiver_id = mh.user_id)
                  OR (fr.receiver_id = auth.uid() AND fr.sender_id   = mh.user_id))
            )
          )
        )
    )
  );

DROP POLICY IF EXISTS comments_select ON public.feed_comments;
CREATE POLICY comments_select
  ON public.feed_comments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.match_history mh
      LEFT JOIN public.profiles p ON p.id = mh.user_id
      WHERE mh.id = feed_comments.match_id
        AND (
          mh.user_id     = auth.uid()
          OR mh.opponent_id = auth.uid()
          OR COALESCE(p.privacy, 'public') = 'public'
          OR (
            COALESCE(p.privacy, 'public') = 'friends'
            AND EXISTS (
              SELECT 1 FROM public.friend_requests fr
              WHERE fr.status = 'accepted'
                AND ((fr.sender_id   = auth.uid() AND fr.receiver_id = mh.user_id)
                  OR (fr.receiver_id = auth.uid() AND fr.sender_id   = mh.user_id))
            )
          )
        )
    )
  );

------------------------------------------------------------
-- 2. match_history.UPDATE tightening + tag-response RPC
------------------------------------------------------------
-- New policy: only the owner may UPDATE directly. Opponent flows
-- (confirm, dispute, tag-accept, tag-reject) all go through SECURITY
-- DEFINER RPCs which bypass RLS. This eliminates the "opponent can
-- rewrite the match score" raw-UPDATE path.
DROP POLICY IF EXISTS match_update ON public.match_history;
CREATE POLICY match_update
  ON public.match_history
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Tag accept/reject moves to an RPC. Previously a direct UPDATE from
-- the client (markMatchTagStatus). Tightening the UPDATE policy above
-- breaks that path; this RPC restores it under a controlled surface.
CREATE OR REPLACE FUNCTION public.respond_to_match_tag(
  p_match_id text,
  p_accept   boolean
)
RETURNS public.match_history
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_match  public.match_history%rowtype;
  v_row    public.match_history%rowtype;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'respond_to_match_tag: not authenticated';
  END IF;

  SELECT * INTO v_match FROM public.match_history WHERE id = p_match_id FOR UPDATE;
  IF v_match.id IS NULL THEN
    RAISE EXCEPTION 'respond_to_match_tag: match not found';
  END IF;

  -- Only the tagged user (the opponent the submitter named) can respond.
  IF v_match.tagged_user_id IS NULL OR v_match.tagged_user_id <> v_uid THEN
    RAISE EXCEPTION 'respond_to_match_tag: not the tagged user';
  END IF;

  -- Idempotent: don't re-write if the user already responded.
  IF v_match.tag_status IN ('accepted', 'rejected') THEN
    RETURN v_match;
  END IF;

  UPDATE public.match_history
     SET tag_status = CASE WHEN p_accept THEN 'accepted' ELSE 'rejected' END,
         status     = CASE WHEN p_accept THEN 'confirmed' ELSE 'expired' END
   WHERE id = p_match_id
   RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.respond_to_match_tag(text, boolean) TO authenticated;

------------------------------------------------------------
-- 3. Rate limiting
------------------------------------------------------------
-- 3a. emit_notification — cap per-recipient bursts from one sender.
--     Triggers fire on the underlying notifications insert that
--     emit_notification performs.
CREATE OR REPLACE FUNCTION public.throttle_emit_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- emit_notification only fires for from_user_id IS NOT NULL rows
  -- (self-emitted notifications skip this gate, e.g. system-emitted).
  IF NEW.from_user_id IS NULL THEN
    RETURN NEW;
  END IF;
  -- Per (sender, recipient) burst: 20 / minute is plenty for any
  -- legitimate burst (chain of likes on a feed, etc.) and shuts down
  -- a tight loop spammer immediately.
  IF (SELECT count(*) FROM public.notifications
       WHERE from_user_id = NEW.from_user_id
         AND user_id      = NEW.user_id
         AND created_at  > now() - interval '1 minute') >= 20 THEN
    RAISE EXCEPTION 'rate limit: too many notifications to this user (>20/min)';
  END IF;
  -- Per-sender global cap: 500 / hour. A real user cannot organically
  -- generate that many notification emissions in an hour.
  IF (SELECT count(*) FROM public.notifications
       WHERE from_user_id = NEW.from_user_id
         AND created_at  > now() - interval '1 hour') >= 500 THEN
    RAISE EXCEPTION 'rate limit: too many notifications sent (>500/hr)';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notifications_throttle ON public.notifications;
CREATE TRIGGER notifications_throttle
  BEFORE INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.throttle_emit_notification();

-- 3b. match_invites — cap per-creator bursts. The existing
--     create_match_invite RPC already guards "only the match logger
--     may invite," but doesn't cap how many invites that logger can
--     fire across all their matches in a window.
CREATE OR REPLACE FUNCTION public.throttle_match_invites()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF (SELECT count(*) FROM public.match_invites
       WHERE invited_by = NEW.invited_by
         AND created_at > now() - interval '1 minute') >= 10 THEN
    RAISE EXCEPTION 'rate limit: more than 10 match invites per minute';
  END IF;
  IF (SELECT count(*) FROM public.match_invites
       WHERE invited_by = NEW.invited_by
         AND created_at > now() - interval '1 day') >= 100 THEN
    RAISE EXCEPTION 'rate limit: more than 100 match invites per day';
  END IF;
  RETURN NEW;
END;
$$;

-- match_invites table may not exist on every project state; guard.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='match_invites') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS match_invites_throttle ON public.match_invites';
    EXECUTE 'CREATE TRIGGER match_invites_throttle BEFORE INSERT ON public.match_invites
             FOR EACH ROW EXECUTE FUNCTION public.throttle_match_invites()';
  END IF;
END $$;
