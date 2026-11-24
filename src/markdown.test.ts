import { describe, expect, it } from 'vitest';
import { parseBlocks, splitTrail, type InlineRun } from './markdown.js';

const para = (blocks: ReturnType<typeof parseBlocks>, i: number) => {
  const b = blocks[i];
  if (b.type !== 'para') throw new Error(`block ${i} is ${b.type}`);
  return b.children;
};
const types = (runs: InlineRun[]) => runs.map((r) => r.type);

describe('splitTrail', () => {
  it('strips glued punctuation but keeps balanced parens', () => {
    expect(splitTrail('https://x.com/a.')).toEqual(['https://x.com/a', '.']);
    expect(splitTrail('https://x.com/f_(b)')).toEqual(['https://x.com/f_(b)', '']);
    expect(splitTrail('https://x.com)')).toEqual(['https://x.com', ')']);
    expect(splitTrail('https://x.com/a,')).toEqual(['https://x.com/a', ',']);
  });
});

describe('parseBlocks — inline', () => {
  it('renders emphasis runs', () => {
    const runs = para(parseBlocks('a **bold** b *it* c ~~gone~~ d `code` e'), 0);
    expect(types(runs)).toEqual(['text', 'bold', 'text', 'italic', 'text', 'strike', 'text', 'code', 'text']);
    expect(runs[1].type === 'bold' && runs[1].children[0]).toEqual({ type: 'text', text: 'bold' });
  });

  it('linkifies [label](url) and bare URLs, splitting trailing punctuation', () => {
    const runs = para(parseBlocks('see [docs](https://x.com/d) or https://x.com/a.'), 0);
    expect(runs[1]).toEqual({ type: 'link', href: 'https://x.com/d', label: 'docs' });
    expect(runs[3]).toEqual({ type: 'link', href: 'https://x.com/a', label: 'https://x.com/a' });
    expect(runs[4]).toEqual({ type: 'text', text: '.' });
  });

  it('renders ![alt](url) as an image and eats the following gap', () => {
    const runs = para(parseBlocks('look ![party](https://x.com/g.gif)\n There he is.'), 0);
    expect(runs).toContainEqual({ type: 'image', src: 'https://x.com/g.gif', alt: 'party' });
  });

  it('linkifies inside emphasis', () => {
    const runs = para(parseBlocks('**check https://x.com out**'), 0);
    expect(runs[0].type === 'bold' && types(runs[0].children)).toEqual(['text', 'link', 'text']);
  });

  it('expands :shortcode: emoji, unknown codes pass through', () => {
    const runs = para(parseBlocks('nice :+1: and :not_a_code:'), 0);
    const text = runs.map((r) => (r.type === 'text' ? r.text : '')).join('');
    expect(text).toBe('nice 👍 and :not_a_code:');
  });

  it('drops the mangled "!Alt Text" embed marker', () => {
    const runs = para(parseBlocks('wow !Check This out'), 0);
    const text = runs.map((r) => (r.type === 'text' ? r.text : '')).join('');
    expect(text).toBe('wow Check This out');
  });
});

describe('parseBlocks — blocks', () => {
  it('splits newline bullets into an unordered list', () => {
    const blocks = parseBlocks('pick one:\n- **A**\n- **B**');
    expect(blocks.map((b) => b.type)).toEqual(['para', 'list']);
    const list = blocks[1];
    if (list.type !== 'list') throw new Error('not a list');
    expect(list.ordered).toBe(false);
    expect(list.items).toHaveLength(2);
    expect(list.items[0][0].type).toBe('bold');
  });

  it('splits numbered lines into an ordered list', () => {
    const blocks = parseBlocks('1. first\n2. second');
    const list = blocks[0];
    if (list.type !== 'list') throw new Error('not a list');
    expect(list.ordered).toBe(true);
    expect(list.items).toHaveLength(2);
  });

  it('splits inline bullet runs ("opts: * **A** * **B**") into a list', () => {
    const blocks = parseBlocks('options: * **Alpha** * **Beta** * **Gamma**');
    expect(blocks.map((b) => b.type)).toEqual(['para', 'list']);
    const list = blocks[1];
    if (list.type !== 'list') throw new Error('not a list');
    expect(list.items).toHaveLength(3);
  });

  it('does not split prose with a single inline marker or math', () => {
    const blocks = parseBlocks('5 * 3 = 15 and a * lone star');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('para');
  });

  it('demotes # headers to a bold para', () => {
    const runs = para(parseBlocks('### Returns Policy'), 0);
    expect(types(runs)).toEqual(['bold']);
    expect(runs[0].type === 'bold' && runs[0].children[0]).toEqual({
      type: 'text',
      text: 'Returns Policy',
    });
  });

  it('emits gap blocks for blank lines', () => {
    const blocks = parseBlocks('one\n\ntwo');
    expect(blocks.map((b) => b.type)).toEqual(['para', 'gap', 'para']);
  });

  it('detaches glued prose from the last list item', () => {
    const blocks = parseBlocks('- short one\n- HTTP. Are you looking to integrate?');
    const list = blocks[0];
    if (list.type !== 'list') throw new Error('not a list');
    expect(list.items).toHaveLength(2);
    expect(blocks[1].type).toBe('para');
    const tail = para(blocks, 1).map((r) => (r.type === 'text' ? r.text : '')).join('');
    expect(tail).toBe('Are you looking to integrate?');
  });

  it('does not detach when the split lands inside an emphasis span', () => {
    const blocks = parseBlocks('- short one\n- **HTTP.** Are you looking to integrate?');
    expect(blocks).toHaveLength(1);
    const list = blocks[0];
    if (list.type !== 'list') throw new Error('not a list');
    expect(list.items).toHaveLength(2);
    // The item stays whole — bold "HTTP." then the trailing sentence.
    expect(types(list.items[1])).toEqual(['bold', 'text']);
  });
});
