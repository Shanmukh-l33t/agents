---
"@cloudflare/ai-chat": patch
"@cloudflare/think": patch
"agents": patch
---

`AIChatAgent` and `Think` settle the transcript before a turn the same way: every turn fails the client tool calls, approval requests and approved calls left pending in earlier replies (with an error text that says which, passed through `repairInterruptedToolPart`), a skipped turn says why in the new `reason` (`continueLastTurn()` returns `"awaiting-client"` and changes nothing while the reply still waits on a client), a reply never reaches the model ending in reasoning, a reply left with nothing to show or send (cut off while the model was still reasoning) is not stored and a stored one is removed for every client, an `AIChatAgent` continuation of a reply cut off mid-text adds its reasoning and text as new parts after the cut-off part (a client now gets `text-start` for it, where the text used to be written into the old part), a tool result replaces the stored `clientTools` only when it settles its call, a `Think` request that sends no `clientTools` clears them, and `AIChatAgent` emits `chat:transcript:repaired`. See [Client-side tools](https://github.com/cloudflare/agents/blob/main/docs/agents/client-tools-continuation.md#when-the-user-moves-on-without-answering).
