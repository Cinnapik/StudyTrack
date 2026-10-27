/** Ограниченное дерево HTML/XML для импорта: текст и атрибуты без выполнения содержимого документа. */
import { Parser } from 'htmlparser2';

// Small inert tree: no script execution, external entities, DOM or Node APIs.
export interface MarkupNode {
  tag: string;
  attrs: Record<string, string>;
  children: MarkupNode[];
  text: string;
}
export function parseMarkup(source: string, xml = false): MarkupNode {
  if (source.length > 20_000_000) throw new Error('Документ слишком большой');
  const root: MarkupNode = { tag: '#root', attrs: {}, children: [], text: '' };
  const stack = [root];
  let count = 0;
  const parser = new Parser(
    {
      onopentag(tag, attrs) {
        if (++count > 150000 || stack.length > 150) throw new Error('Слишком сложный документ');
        const node = { tag, attrs, children: [], text: '' };
        stack[stack.length - 1]!.children.push(node);
        stack.push(node);
      },
      ontext(text) {
        stack[stack.length - 1]!.text += text;
      },
      onclosetag() {
        if (stack.length > 1) stack.pop();
      },
    },
    { xmlMode: xml, decodeEntities: true },
  );
  parser.end(source);
  return root;
}
export function elements(node: MarkupNode, tag: string): MarkupNode[] {
  return node.children.flatMap((c) => [...(c.tag === tag ? [c] : []), ...elements(c, tag)]);
}
export function content(node: MarkupNode): string {
  if (['script', 'style'].includes(node.tag)) return '';
  return node.text + node.children.map(content).join(' ');
}
export const cleanText = (node: MarkupNode) => content(node).replace(/\s+/g, ' ').trim();
