/** Port of the webchat Bubble's message renderer (apps/api/public/
 * widget.js — appendBlocks/appendRich/linkify/splitTrail/demojize) into
 * a render-agnostic AST. Canonical agent text is markdown-ish:
 * **bold**, *italic*, ~~strike~~, `code`, [label](url) and bare-URL
 * links, ![alt](url) inline images (gif embeds), :shortcode: emoji,
 * bullet/numbered lists (including the inline " * **A** * **B**" run
 * form), and markdown headers demoted to bold lines. Keep behavior in
 * sync with widget.js — both sides render the same wire text. */
import { demojize } from './emoji.js';

export type InlineRun =
  | { type: 'text'; text: string }
  | { type: 'bold' | 'italic' | 'strike' | 'code'; children: InlineRun[] }
  | { type: 'link'; href: string; label: string }
  | { type: 'image'; src: string; alt: string };

export type Block =
  | { type: 'para'; children: InlineRun[] }
  | { type: 'list'; ordered: boolean; items: InlineRun[][] }
  /** Blank line — a real paragraph gap, not a collapsed newline. */
  | { type: 'gap' };

const LINK_IMG_RE =
  /!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s<>()]+)/g;
const EM_RE =
  /\*\*([^\s*](?:[^*]*[^\s*])?)\*\*|\*([^\s*](?:[^*]*[^\s*])?)\*|~~([^\s~](?:[^~]*[^\s~])?)~~|`([^`\n]+)`/g;
const BULLET_LEAD = /^(?:[-*•])\s+/;
const NUM_LEAD = /^\d+[.)]\s+/;
const INLINE_BULLET = / (?:(?:[*-])|(?:\d+[.)])) (?=\*\*)/g;
const HEADER = /^(#{1,6})\s+(.*)$/;
const MANGLED_EMBED = /(^|\s)!([A-Z])/g;

/** Sentence punctuation glued to a URL — "see https://x.com/a." links
 * the URL, not the period. Closers strip only when unbalanced, so
 * https://x.com/f_(b) keeps its parens while "(see https://x.com)"
 * doesn't eat the bracket. Returns [cleanUrl, trailingText]. */
export function splitTrail(u: string): [string, string] {
  let trail = '';
  const pairs: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
  while (u.length) {
    const c = u.charAt(u.length - 1);
    if (".,;:!?'\"".includes(c)) {
      trail = c + trail;
      u = u.slice(0, -1);
      continue;
    }
    const open = pairs[c];
    if (open && u.split(c).length - 1 > u.split(open).length - 1) {
      trail = c + trail;
      u = u.slice(0, -1);
      continue;
    }
    break;
  }
  return [u, trail];
}

/** The whitespace separating an image from following text is markup
 * scaffolding — the widget eats it so it doesn't render as a phantom
 * indent under the image. */
const eatGap = (s: string) => s.replace(/^[ \t]*\n?[ \t]*/, '');

function linkify(text: string): InlineRun[] {
  // Mangled embeds leak as "!Alt Text" when the model drops the (url) —
  // never natural prose (real '!' ends a word or takes a space).
  text = text.replace(MANGLED_EMBED, '$1$2');
  const runs: InlineRun[] = [];
  LINK_IMG_RE.lastIndex = 0;
  let last = 0;
  let afterImg = false;
  let m: RegExpExecArray | null;
  const pushText = (s: string) => {
    if (s) runs.push({ type: 'text', text: s });
  };
  while ((m = LINK_IMG_RE.exec(text))) {
    let pre = text.slice(last, m.index);
    if (afterImg) pre = eatGap(pre);
    afterImg = false;
    pushText(pre);
    if (m[2]) {
      // ![alt](url) — dead srcs fall back to the link form downstream.
      const [src, t] = splitTrail(m[2]);
      if (!src) {
        pushText(m[0]);
      } else {
        runs.push({ type: 'image', src, alt: m[1] || 'image' });
        afterImg = true;
        pushText(t);
      }
    } else {
      const [href, t] = splitTrail(m[4] || m[5]);
      if (!href) {
        pushText(m[0]);
      } else {
        runs.push({ type: 'link', href, label: m[3] || href });
        pushText(t);
      }
    }
    last = LINK_IMG_RE.lastIndex;
  }
  let tail = text.slice(last);
  if (afterImg) tail = eatGap(tail);
  pushText(tail);
  return runs;
}

/** Emphasis pass — content inside a tag still linkifies, matching the
 * widget's appendRich. */
function parseInline(text: string): InlineRun[] {
  const runs: InlineRun[] = [];
  EM_RE.lastIndex = 0;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = EM_RE.exec(text))) {
    if (m.index > last) runs.push(...linkify(text.slice(last, m.index)));
    const inner = m[1] ?? m[2] ?? m[3] ?? m[4];
    const type = m[1] != null ? 'bold' : m[2] != null ? 'italic' : m[3] != null ? 'strike' : 'code';
    runs.push({ type, children: linkify(inner) } as InlineRun);
    last = EM_RE.lastIndex;
  }
  if (last < text.length) runs.push(...linkify(text.slice(last)));
  return runs;
}

function sents(s: string): string[] {
  const m = s.match(/[^.!?]+[.!?]+\s*|[^.!?]+$/g);
  return m ? m.map((x) => x.trim()).filter(Boolean) : [];
}

/** Block pass — paragraphs, lists (bulleted + numbered + the inline-run
 * form), headers-demoted-to-bold, and blank-line gaps. Mirrors
 * appendBlocks: items collect until flush so prose glued onto the last
 * item can detach into a following paragraph. */
export function parseBlocks(raw: string): Block[] {
  const blocks: Block[] = [];
  const text = demojize(raw);
  let listItems: string[] | null = null;
  let ordered = false;

  const flush = () => {
    if (listItems?.length) {
      let tail: string | null = null;
      if (listItems.length >= 2) {
        const lastS = sents(listItems[listItems.length - 1]);
        const allSingle = listItems.slice(0, -1).every((i) => sents(i).length <= 1);
        // Don't split inside an emphasis span — "**HTTP.** Are you…"
        // detaching would leave an unclosed ** on the item and a stray
        // * leading the tail paragraph.
        const stars = lastS.length ? (lastS[0].match(/\*\*/g) || []).length : 0;
        if (lastS.length >= 2 && allSingle && stars % 2 === 0) {
          tail = lastS.slice(1).join(' ');
          listItems[listItems.length - 1] = lastS[0];
        }
      }
      blocks.push({
        type: 'list',
        ordered,
        items: listItems.map((item) => parseInline(item)),
      });
      if (tail) blocks.push({ type: 'para', children: parseInline(tail) });
    }
    listItems = null;
    ordered = false;
  };

  for (const rawLine of text.split('\n')) {
    const t = rawLine.trim();
    if (!t) {
      flush();
      if (blocks.length && blocks[blocks.length - 1].type !== 'gap') {
        blocks.push({ type: 'gap' });
      }
      continue;
    }
    const hm = HEADER.exec(t);
    if (hm) {
      // No heading level — demote to a bold line so ### doesn't render
      // literally. Headers that already carry emphasis render rich.
      flush();
      const htext = hm[2].replace(/\s*#+\s*$/, '');
      const children = htext.includes('*')
        ? parseInline(htext)
        : [{ type: 'bold' as const, children: linkify(htext) }];
      blocks.push({ type: 'para', children });
      continue;
    }
    if (BULLET_LEAD.test(t) || NUM_LEAD.test(t)) {
      const isOrdered = NUM_LEAD.test(t);
      if (listItems && isOrdered !== ordered) flush();
      ordered = isOrdered;
      if (!listItems) listItems = [];
      const body = t.replace(BULLET_LEAD, '').replace(NUM_LEAD, '');
      for (const item of body.split(INLINE_BULLET)) listItems.push(item);
      continue;
    }
    const marks = t.match(INLINE_BULLET) || [];
    if (marks.length >= 2) {
      flush();
      const parts = t.split(INLINE_BULLET);
      const lead = parts[0].trim();
      if (lead) blocks.push({ type: 'para', children: parseInline(lead) });
      ordered = /\d/.test(marks[0] ?? '');
      listItems = parts.slice(1);
      continue;
    }
    flush();
    blocks.push({ type: 'para', children: parseInline(t) });
  }
  flush();
  return blocks;
}
