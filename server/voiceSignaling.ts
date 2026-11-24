import { isRecord } from "./socketPayload";

/** Signaling is text-only and tiny compared with the 5 MB socket transport cap. */
export const MAX_SDP_LENGTH = 20_000;
export const MAX_ICE_CANDIDATE_LENGTH = 2_000;
export const MAX_SDP_MID_LENGTH = 64;
export const MAX_USERNAME_FRAGMENT_LENGTH = 256;
const MAX_SDP_M_LINE_INDEX = 10_000;

export interface SessionDescription {
  type: "offer" | "answer";
  sdp: string;
}

export interface IceCandidate {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
  usernameFragment: string | null;
}

/**
 * Rebuild only the fields WebRTC actually consumes. Deeply nested or unknown
 * keys are dropped, so a malicious blob is never relayed to another user (#76).
 */
export function readSessionDescription(
  value: unknown,
  expectedType: SessionDescription["type"]
): SessionDescription | null {
  if (!isRecord(value) || value.type !== expectedType) return null;
  const sdp = value.sdp;
  if (typeof sdp !== "string" || sdp.length === 0 || sdp.length > MAX_SDP_LENGTH) return null;
  return { type: expectedType, sdp };
}

export function readIceCandidate(value: unknown): IceCandidate | null {
  if (!isRecord(value)) return null;

  const candidate = value.candidate;
  // An empty candidate is the valid end-of-candidates marker in Trickle ICE.
  if (typeof candidate !== "string" || candidate.length > MAX_ICE_CANDIDATE_LENGTH) return null;

  const sdpMid = value.sdpMid;
  if (sdpMid !== undefined && sdpMid !== null) {
    if (typeof sdpMid !== "string" || sdpMid.length > MAX_SDP_MID_LENGTH) return null;
  }

  const sdpMLineIndex = value.sdpMLineIndex;
  if (sdpMLineIndex !== undefined && sdpMLineIndex !== null) {
    if (
      typeof sdpMLineIndex !== "number" ||
      !Number.isInteger(sdpMLineIndex) ||
      sdpMLineIndex < 0 ||
      sdpMLineIndex > MAX_SDP_M_LINE_INDEX
    ) {
      return null;
    }
  }

  const usernameFragment = value.usernameFragment;
  if (usernameFragment !== undefined && usernameFragment !== null) {
    if (
      typeof usernameFragment !== "string" ||
      usernameFragment.length > MAX_USERNAME_FRAGMENT_LENGTH
    ) {
      return null;
    }
  }

  return {
    candidate,
    sdpMid: typeof sdpMid === "string" ? sdpMid : null,
    sdpMLineIndex: typeof sdpMLineIndex === "number" ? sdpMLineIndex : null,
    usernameFragment: typeof usernameFragment === "string" ? usernameFragment : null,
  };
}
