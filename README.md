# ChatGPT 回复模型标记

这个脚本会在网页版 ChatGPT 的回复结束后，在“切换模型/重试”按钮下方显示模型标记，例如：

```text
已使用 GPT-5.5 Thinking
```

它只是修改你本机浏览器里的页面显示，不会改变实际使用的模型，也不会把信息发送到外部服务。

## 安装方法

1. 浏览器安装 Tampermonkey 或 Violentmonkey。
2. 建议新建一个用户脚本，不要覆盖旧脚本。
3. 把 `chatgpt-model-badge.user.js` 的内容完整粘贴进去并保存。
4. 刷新 `https://chatgpt.com/`。
5. 刷新后再开始新的回复，脚本会尽量从 ChatGPT 自己的会话响应里识别实际模型，并在“切换模型/重试”按钮下方显示。

普通版 ChatGPT 和 ChatGPT Pro 页面都走同一套页面结构识别逻辑，不需要单独安装两份脚本。

## 修改显示文字

打开 `chatgpt-model-badge.user.js`，找到这一行：

```js
fallbackText: '已使用 GPT-5.5 Thinking',
```

把引号里的文字改成你想显示的内容即可。

## 只给最后一条回复显示

默认会给页面里所有已完成的助手回复都加标记。如果只想给最后一条显示，把：

```js
onlyLatestAssistant: false,
```

改成：

```js
onlyLatestAssistant: true,
```

## 说明

新版 ChatGPT 里，截图中的循环箭头按钮在 DOM 里通常是 `aria-label="切换模型"`。ChatGPT 自带的“已使用 ...”提示只有鼠标悬停在这个按钮上时才会出现，浮层文本类似：

```text
重试…
已使用 GPT-5.5 Thinking
```

脚本会在 `document-start` 尽早运行，拦截 ChatGPT 网页自己发起的 `/backend-api/...conversation...` 响应副本，从助手消息的 `metadata.model_slug` 里提取模型并更新标记。这个过程只读取页面已经收到的响应副本，不读取或保存登录 token，也不会向外部发送数据。

如果脚本安装或更新前，某些历史回复已经加载完成，页面里通常没有现成的模型字段可读。这种情况下脚本会先显示 `fallbackText`，当你鼠标悬停出原生浮层时，再读取其中的“已使用 ...”文本并更新标记。更新油猴脚本后建议刷新一次 ChatGPT 页面，让 `document-start` 的接口监听从页面加载初期开始生效。

已用 Chrome 插件在测试对话里确认：`button[aria-label="切换模型"]` 是 Pro 页面里的正确锚点，原生 tooltip 可以提取出 `已使用 GPT-5.5 Thinking`。脚本也兼容普通版可能出现的 `重试`、`重新生成`、`retry`、`regenerate`、`try again` 等按钮名。

底部最后一条回复容易被输入框盖住，所以脚本现在不是用浮层绝对定位，而是把标记作为操作按钮工具栏的下一行插入，实际占布局高度，更容易稳定显示。

如果你之前装过旧版，页面里可能仍在运行旧脚本，页面里会残留 `position: absolute` 的旧样式。新版脚本名是 `ChatGPT 模型标记：GPT-5.5 Thinking（强制显示版）`，版本是 `1.5.0`，会在运行时强制覆盖旧 style。保存新版后刷新 ChatGPT 页面即可。

如果仍看不到，打开浏览器控制台检查是否有这一行：

```text
[ChatGPT 模型标记] 已运行 v1.5.0
```

如果没有这行，说明油猴没有在当前 ChatGPT 页面运行这个新脚本，优先检查脚本是否启用、`@match` 是否完整，以及旧脚本是否还单独启用。

ChatGPT 网页结构可能会更新。脚本已经尽量用按钮文本、`data-testid` 和 DOM 监听做了兼容；如果以后页面改版导致标记不出现，可以优先检查重试按钮和操作按钮的识别规则。
