// Name — collects first + last name. Stored locally; flushed to
// auth.user_metadata.name + profiles.name on the EmailPassword step.
import { useEffect, useRef } from "react";
import { PrimaryButton, BigInput, ScreenHeader, ScreenIn } from "../atoms.jsx";

export default function Name({ state, set, next, T }) {
  const firstRef = useRef(null);
  useEffect(() => { if (firstRef.current) firstRef.current.focus(); }, []);
  const valid = state.first.trim().length > 0 && state.last.trim().length > 0;

  return (
    <ScreenIn k="s1">
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "12px 28px 28px" }}>
        <ScreenHeader T={T} eyebrow="01 — Identity" title="What's your name?" subtitle="This is how other players will see you." />
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 28 }}>
          <BigInput T={T} placeholder="First name" autoComplete="given-name"
            value={state.first} onChange={(v) => set({ first: v })} ref={firstRef} />
          <BigInput T={T} placeholder="Last name" autoComplete="family-name"
            value={state.last}  onChange={(v) => set({ last: v })} />
        </div>
        <div style={{ flex: 1 }}/>
        <PrimaryButton T={T} disabled={!valid} onClick={next}>Continue</PrimaryButton>
      </div>
    </ScreenIn>
  );
}
