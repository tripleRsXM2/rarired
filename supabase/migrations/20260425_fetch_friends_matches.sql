-- 20260425_fetch_friends_matches.sql
--
-- Adds the SECURITY DEFINER RPC `fetch_friends_matches` so the Home feed
-- can show third-party matches (matches between two of the viewer's
-- friends, where the viewer is NOT a party). The default RLS policy on
-- match_history (`auth.uid() = user_id OR auth.uid() = opponent_id`) is
-- intentionally tight — this RPC is the single, audited path through it.
--
-- Privacy posture: a friend's friend cannot see the viewer's matches.
-- Only DIRECT accepted-friend connections from the caller's perspective.
-- Returns confirmed matches only; pending / disputed / voided / expired
-- rows are excluded.
--
-- Pagination: `p_before` lets the client page back through history by
-- passing the oldest confirmed_at it has rendered. `p_limit` defaults to
-- 50 — enough to populate "All activity" without paging on first load.

create or replace function public.fetch_friends_matches(
  p_user_id uuid,
  p_limit   int        default 50,
  p_before  timestamptz default null
)
returns setof public.match_history
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Authorization: caller must be reading their OWN friend graph. We
  -- never let one user impersonate another's "friends" view. Also rejects
  -- unauthenticated calls (auth.uid() returns null in that case).
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Cap the limit so a misbehaving client can't request 100k rows.
  if p_limit is null or p_limit < 1 then p_limit := 50; end if;
  if p_limit > 200 then p_limit := 200; end if;

  return query
  with friends as (
    -- Caller's accepted-friend edges, normalised to the OTHER user's id.
    select case
             when fr.sender_id   = p_user_id then fr.receiver_id
             else                                  fr.sender_id
           end as friend_id
    from public.friend_requests fr
    where fr.status = 'accepted'
      and (fr.sender_id = p_user_id or fr.receiver_id = p_user_id)
  )
  select m.*
  from public.match_history m
  where m.status = 'confirmed'
    -- Exclude rows the viewer is already a party to — those come back
    -- through the existing fetchOwnMatches / fetchOpponentMatches paths
    -- and would otherwise be duplicated in the merged feed.
    and m.user_id <> p_user_id
    and (m.opponent_id is null or m.opponent_id <> p_user_id)
    -- AT LEAST ONE side of the match must be a friend.
    and (
      m.user_id in (select friend_id from friends)
      or (m.opponent_id is not null
          and m.opponent_id in (select friend_id from friends))
    )
    -- Pagination cursor — oldest confirmed_at the client has seen.
    and (p_before is null or m.confirmed_at < p_before)
  -- confirmed_at is the canonical "when this entered the public record"
  -- timestamp. NULLs sort last as a defensive fallback, though
  -- confirmed-status rows always have a non-null confirmed_at by the
  -- apply_match_outcome trigger.
  order by m.confirmed_at desc nulls last
  limit p_limit;
end;
$$;

revoke all on function public.fetch_friends_matches(uuid, int, timestamptz) from public;
grant execute on function public.fetch_friends_matches(uuid, int, timestamptz) to authenticated;

comment on function public.fetch_friends_matches(uuid, int, timestamptz) is
  'Returns confirmed match_history rows where at least one party is an accepted friend of p_user_id and the caller is not a party. SECURITY DEFINER bypasses match_history RLS but enforces caller=viewer + accepted-friend relationship. Used by the Home "All activity" feed to surface friends-of-the-caller activity that strict RLS would otherwise hide.';