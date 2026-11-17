# 朗读评分原型

独立页面，不改动主应用。用浏览器打开 `score.html`（需 https 或 localhost，因为要用麦克风），
朗读文本框里的内容，点“结束并评分”。

- `score.js`：拼音对齐与打分（纯函数 `ReadScore.alignAndScore`，可单独测试）
- `score.html`：调用 Web Speech API（zh-CN）的演示页

局限：语音识别会把发音“纠正”成最可能的词，所以它更适合检查漏读、错字，不能评判声调和发音细节。
