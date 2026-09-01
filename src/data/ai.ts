/**
 * The client.
 *
 * Everything this app asks goes through here: the models it may use, the
 * threads it has, and the turn it is streaming. There is no second HTTP client
 * for any of it — `createAiClient` owns the base URL, the bearer, the retry on
 * a stale token and the SSE decode, so none of those is decided again here.
 *
 * The estate's token source is the SAME `@hanzo/iam` instance the session signs
 * in with, handed over structurally as the SDK's `IamAuth`. That is the whole
 * integration: the SDK takes a fresh token per request and calls `invalidate()`
 * when one is refused, so a token that ages out mid-visit is re-minted without
 * this app owning a renewal, a single-flight, or a replay.
 *
 * Which origin answers lives in `~/data/origin`; this is the name the rest of
 * the app calls it by.
 */
import { client } from '~/data/origin'

export const ai = client
