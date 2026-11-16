[![make.fun · markdown-render-speed-02](https://make.fun/badge/markdown-render-speed-02.svg)](https://make.fun/bounty/markdown-render-speed-02?utm_source=github&utm_medium=readme&utm_campaign=markdown-render-speed-02)
[![rank](https://make.fun/badge/markdown-render-speed-02/0xjouje-ai/makefun-markdown-speed/rank.svg)](https://make.fun/bounty/markdown-render-speed-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=markdown-render-speed-02)
[![reward](https://make.fun/badge/markdown-render-speed-02/0xjouje-ai/makefun-markdown-speed/reward.svg)](https://make.fun/bounty/markdown-render-speed-02?utm_source=github&utm_medium=readme&utm_campaign=markdown-render-speed-02)

# Markdown Speed

An original, dependency-free JavaScript renderer targeting the exact default HTML output of marked 18.1.3, including GitHub Flavored Markdown. Block scanning collects forward references; inline scanning renders HTML directly and skips ordinary text in chunks. Each call owns its parsing state, with no caches or stored document outputs.

```js
import { parse } from './parse.js';
const html = parse('# Hello\n');
```

Run `node main.ts` with Node 22. The driver reads `cases.json` from `MAKEFUN_INPUT_DIR` (default `/input`) and writes the ordered HTML array to `MAKEFUN_OUTPUT_DIR/html.json` (default `/output/html.json`). No installation is needed.

Validation: byte-for-byte matches on all 720 supplied practice cases and 2,000 additional README documents drawn with the kit generator.

MIT licensed; see LICENSE.
