/* eslint-disable @typescript-eslint/no-non-null-asserted-optional-chain */
/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { expect, type Page } from '@playwright/test';
import type {
  BaseBlockModel,
  PrefixedBlockProps,
  SerializedStore,
} from '../../packages/store';

export const defaultStore: SerializedStore = {
  blocks: {
    '0': {
      'sys:id': '0',
      'sys:flavour': 'page',
      'sys:children': ['1'],
    },
    '1': {
      'sys:flavour': 'group',
      'sys:id': '1',
      'sys:children': ['2'],
      'prop:xywh': '[0,0,0,0]',
    },
    '2': {
      'sys:flavour': 'paragraph',
      'sys:id': '2',
      'sys:children': [],
      'prop:text': 'hello',
      'prop:type': 'text',
    },
  },
};

export async function assertEmpty(page: Page) {
  const actual = await page.locator('paragraph-block').count();
  expect(actual).toBe(0);
}

export async function assertTitle(page: Page, text: string) {
  const locator = page.locator('input').nth(0);
  const actual = await locator.inputValue();
  expect(actual).toBe(text);
}

export async function assertText(page: Page, text: string) {
  const actual = await page.innerText('.ql-editor');
  expect(actual).toBe(text);
}

/**
 * @deprecated Use {@link assertMatchMarkdown} instead
 */
export async function assertRichTexts(page: Page, texts: string[]) {
  const actual = await page.locator('.ql-editor').allInnerTexts();
  expect(actual).toEqual(texts);
}

export async function assertBlockCount(
  page: Page,
  flavour: string,
  count: number
) {
  const actual = await page.locator(`${flavour}-block`).count();
  expect(actual).toBe(count);
}

export async function assertSelection(
  page: Page,
  richTextIndex: number,
  rangeIndex: number,
  rangeLength: number
) {
  const actual = await page.evaluate(
    ({ richTextIndex }) => {
      const quill =
        // @ts-ignore
        document.querySelectorAll('rich-text')[richTextIndex]?._quill!;
      return quill.getSelection();
    },
    { richTextIndex }
  );
  expect(actual).toEqual({ index: rangeIndex, length: rangeLength });
}

export async function assertSelectedBlockCount(page: Page, expected: number) {
  const actual = await page.evaluate(() => {
    const selectionInfo =
      document.querySelector('default-page-block')?.selection.selectionInfo;
    if (selectionInfo?.type === 'Block') {
      return selectionInfo.blocks.length;
    }

    return 0;
  });
  expect(actual).toBe(expected);
}

export async function assertStore(page: Page, expected: SerializedStore) {
  const actual = (await page.evaluate(() =>
    // @ts-ignore
    window.store.doc.toJSON()
  )) as SerializedStore;
  expect(actual).toEqual(expected);
}

export async function assertBlockChildrenIds(
  page: Page,
  blockId: string,
  ids: string[]
) {
  const actual = await page.evaluate(
    ({ blockId }) => {
      const element = document.querySelector(`[data-block-id="${blockId}"]`);
      // @ts-ignore
      const model = element.model as BaseBlockModel;
      return model.children.map(child => child.id);
    },
    { blockId }
  );
  expect(actual).toEqual(ids);
}

export async function assertBlockChildrenFlavours(
  page: Page,
  blockId: string,
  flavours: string[]
) {
  const actual = await page.evaluate(
    ({ blockId }) => {
      const element = document.querySelector(`[data-block-id="${blockId}"]`);
      // @ts-ignore
      const model = element.model as BaseBlockModel;
      return model.children.map(child => child.flavour);
    },
    { blockId }
  );
  expect(actual).toEqual(flavours);
}

export async function assertClassName(
  page: Page,
  selector: string,
  className: RegExp
) {
  const locator = page.locator(selector);
  await expect(locator).toHaveClass(className);
}

export async function assertTextContent(
  page: Page,
  selector: string,
  text: RegExp
) {
  const locator = page.locator(selector);
  await expect(locator).toHaveText(text);
}

export async function assertBlockType(page: Page, id: string, type: string) {
  const actual = await page.evaluate(
    ({ id }) => {
      const element = document.querySelector(`[data-block-id="${id}"]`);
      // @ts-ignore
      const model = element.model as BaseBlockModel;
      // @ts-ignore
      return model.type;
    },
    { id }
  );
  expect(actual).toBe(type);
}

export async function assertMatchMarkdown(page: Page, text: string) {
  const jsonDoc = (await page.evaluate(() =>
    // @ts-expect-error
    window.store.doc.toJSON()
  )) as SerializedStore;
  const titleNode = jsonDoc.blocks['0'];

  const markdownVisitor = (node: PrefixedBlockProps): string => {
    // TODO use schema
    if (node['sys:flavour'] === 'page') {
      return (node['prop:title'] as string) ?? '';
    }
    if (!('prop:type' in node)) {
      return '[? unknown node]';
    }
    if (node['prop:type'] === 'text') {
      return node['prop:text'] as string;
    }
    if (node['prop:type'] === 'bulleted') {
      return `- ${node['prop:text']}`;
    }
    // TODO please fix this
    return `[? ${node['prop:type']} node]`;
  };

  const INDENT_SIZE = 2;
  const visitNodes = (
    node: PrefixedBlockProps,
    visitor: (node: PrefixedBlockProps) => string
  ): string[] => {
    if (!('sys:children' in node) || !Array.isArray(node['sys:children'])) {
      throw new Error("Failed to visit nodes: 'sys:children' is not an array");
      // return visitor(node);
    }

    const children = node['sys:children'].map(id => jsonDoc.blocks[id]);
    return [
      visitor(node),
      ...children.flatMap(child =>
        visitNodes(child, visitor).map(line => {
          if (node['sys:flavour'] === 'page') {
            // Ad hoc way to remove the title indent
            return line;
          }

          return ' '.repeat(INDENT_SIZE) + line;
        })
      ),
    ];
  };
  const visitRet = visitNodes(titleNode, markdownVisitor);
  const actual = visitRet.join('\n');

  expect(actual).toEqual(text);
}
