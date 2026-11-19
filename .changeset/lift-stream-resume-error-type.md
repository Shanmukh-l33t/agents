---
"agents": patch
---

A failed stream resume now throws the exported `CloudflareAIError`, which extends `APICallError`, instead of the internal core error. See [#2687](https://github.com/cloudflare/agents/issues/2687).