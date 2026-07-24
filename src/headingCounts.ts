/** 見出しバッジで選択可能な指標 */
export type HeadingCountMetric = 'chars' | 'chars-no-space' | 'words';

export interface HeadingCountInput {
  /** 見出しレベル（h1=1 〜 h6=6） */
  level: number;
  /** その見出し自身の内容（次の見出しの直前まで、見出しタイトル自体は含まない）のカウント */
  ownCount: number;
}

export interface HeadingCountResult {
  /** 自身の内容のみのカウント */
  ownCount: number;
  /** 自身 + 配下すべての見出しを含めた合計カウント */
  totalCount: number;
  /** 配下に子見出しを持つかどうか（false の場合は末端見出し） */
  hasChildren: boolean;
}

/**
 * 見出しの階層構造をもとに、各見出しの「自身の内容」と「配下すべてを含む合計」を集計する。
 *
 * 同じ階層の兄弟見出しは互いのカウントを含まず、それぞれの祖先にのみ加算される
 * （例: h1 配下に h2 が2つある場合、h1 の合計は両方の h2 を含むが、各 h2 同士は独立）。
 * 末端見出し（子を持たない）は totalCount を表示上使わない想定のため、
 * hasChildren で呼び出し側が分母の要否を判断できるようにしている。
 */
export const aggregateHeadingCounts = (headings: HeadingCountInput[]): HeadingCountResult[] => {
  const n = headings.length;
  const parent: (number | null)[] = new Array(n).fill(null);
  const stack: number[] = [];

  // 見出しレベルに基づいて親子関係を決定する（標準的なアウトライン構築アルゴリズム）。
  // スタック上の直近の見出しレベルが自分以上なら、それは祖先ではないのでポップする。
  for (let i = 0; i < n; i++) {
    while (stack.length > 0 && headings[stack[stack.length - 1]].level >= headings[i].level) {
      stack.pop();
    }
    parent[i] = stack.length > 0 ? stack[stack.length - 1] : null;
    stack.push(i);
  }

  const totalCount = headings.map((h) => h.ownCount);
  const hasChildren: boolean[] = new Array(n).fill(false);

  // 文書順の逆順に走査することで、各見出しの totalCount が確定してから
  // その親へ1回だけ加算されるようにする（多段のネストも正しく積み上がる）。
  for (let i = n - 1; i >= 0; i--) {
    const p = parent[i];
    if (p !== null) {
      totalCount[p] += totalCount[i];
      hasChildren[p] = true;
    }
  }

  return headings.map((h, i) => ({
    ownCount: h.ownCount,
    totalCount: totalCount[i],
    hasChildren: hasChildren[i],
  }));
};
