// 中文朗读自动评分原型：浏览器语音识别 (Web Speech API, zh-CN) + 拼音对齐
// 纯函数部分（alignAndScore）不依赖浏览器，可在 Node 里测试。
(function (root) {
  const isZh = (ch) => /[㐀-鿿豈-﫿]/.test(ch);

  // 文本 -> [{ch, py, base}]，py 带声调数字，base 去掉声调。整句转换以便多音字按上下文取音。
  function toSyllables(text, pinyinFn) {
    const chars = Array.from(text).filter(isZh);
    if (!chars.length) return [];
    const pys = pinyinFn(chars.join(""), { type: "array", toneType: "num", v: true });
    return chars.map((ch, i) => {
      const py = (pys[i] || "").toLowerCase();
      return { ch, py, base: py.replace(/[0-9]/g, "") };
    });
  }

  // 编辑距离对齐。同字或同音同调 = 0；同音不同调 = 0.5；其他替换 = 1；漏读/多读 = 1。
  function cost(a, b) {
    if (a.ch === b.ch || a.py === b.py) return 0;
    if (a.base === b.base) return 0.5;
    return 1;
  }

  function alignAndScore(targetText, heardText, pinyinFn) {
    const T = toSyllables(targetText, pinyinFn);
    const H = toSyllables(heardText, pinyinFn);
    const n = T.length, m = H.length;
    const d = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = 1; i <= n; i++) d[i][0] = i;
    for (let j = 1; j <= m; j++) d[0][j] = j;
    for (let i = 1; i <= n; i++)
      for (let j = 1; j <= m; j++)
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost(T[i - 1], H[j - 1]));

    // 回溯
    const perChar = new Array(n);
    let extra = 0, i = n, j = m;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + cost(T[i - 1], H[j - 1])) {
        const c = cost(T[i - 1], H[j - 1]);
        perChar[i - 1] = { ...T[i - 1], heard: H[j - 1].ch, heardPy: H[j - 1].py,
          status: c === 0 ? "ok" : c === 0.5 ? "tone" : "wrong" };
        i--; j--;
      } else if (i > 0 && d[i][j] === d[i - 1][j] + 1) {
        perChar[i - 1] = { ...T[i - 1], heard: "", heardPy: "", status: "missing" };
        i--;
      } else { extra++; j--; }
    }

    const count = (s) => perChar.filter((p) => p.status === s).length;
    const ok = count("ok"), tone = count("tone"), wrong = count("wrong"), missing = count("missing");
    const accuracy = n ? Math.max(0, Math.round(100 * (ok + 0.5 * tone - 0.5 * extra) / n)) : 0;
    const completeness = n ? Math.round(100 * (n - missing) / n) : 0;
    return { perChar, ok, tone, wrong, missing, extra, total: n, accuracy, completeness };
  }

  root.ReadScore = { alignAndScore, toSyllables, isZh };
  if (typeof module !== "undefined") module.exports = root.ReadScore;
})(typeof window !== "undefined" ? window : globalThis);
