<h1>朗读练习</h1>
输入文本，练习朗读。支持显示汉语拼音。可录音。

## 自动评分

**浏览器识别评分（默认开启，免费）**：录音时同时用浏览器自带的中文语音识别（Web Speech API, zh-CN），
停止后按拼音与原文逐字对齐，给出准确度、完整度，并标出读对 / 声调可疑 / 读错 / 漏读的字。
支持 Chrome、Edge、Safari（含 iPad）；Firefox 不支持。可在朗读界面用“自动评分”开关关闭。
它适合检查漏读和错字，不能真正评判声调。

**发音评分（Azure，可选）**：评估每个词的发音准确度、流利度、完整度，包括声调。需要：

1. 在 Azure 创建“语音服务”（Speech）资源，区域选 **Southeast Asia（新加坡）**，免费层 F0 即可开始；拿到密钥。
2. 部署 `worker/` 里的 Cloudflare Worker（保管密钥，网页不接触密钥）：
   ```
   cd worker
   npx wrangler login
   npx wrangler secret put AZURE_SPEECH_KEY   # 粘贴 Azure 密钥
   npx wrangler deploy
   ```
   `wrangler.toml` 里的 `ALLOWED_ORIGIN` 要改成你网页的地址。
3. 把 Worker 的网址填进 `js/config.js` 的 `AZURE_PROXY_URL`。之后录音停止后会出现“发音评分”按钮。

单次最多评 60 秒，长文请分段朗读。
