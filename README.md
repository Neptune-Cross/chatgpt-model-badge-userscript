# ChatGPT 回复模型标记

这个脚本会在网页版 ChatGPT 的回复结束后，在“切换模型/重试”按钮下方自动显示：

```text
已使用 GPT-5.5 Thinking
```

它只是修改你本机浏览器里的页面显示，不会改变实际使用的模型，也不会把信息发送到外部服务。

## 安装方法

1. 浏览器安装 Tampermonkey 或 Violentmonkey。
2. 新建一个用户脚本。
3. 把 `chatgpt-model-badge.user.js` 的内容完整粘贴进去并保存。
4. 刷新 `https://chatgpt.com/`。
5. 等 ChatGPT 回复完成后，“切换模型/重试”按钮下方会自动出现模型标记。

普通版 ChatGPT 和 ChatGPT Pro 页面都走同一套页面结构识别逻辑，不需要单独安装两份脚本。

## 修改显示文字

打开 `chatgpt-model-badge.user.js`，找到这一行：

```js
labelText: '已使用 GPT-5.5 Thinking',
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

这个脚本不依赖那个浮层常驻存在，会先在按钮下方固定显示默认标记；当你鼠标悬停出原生浮层时，脚本会读取其中的“已使用 ...”文本并更新标记。

已用 Chrome 插件在测试对话里确认：`button[aria-label="切换模型"]` 是正确锚点，原生 tooltip 可以提取出 `已使用 GPT-5.5 Thinking`。普通 userscript 不能伪造真实鼠标悬停来提前打开这个 tooltip，所以首次进入页面时会先显示默认文本。

ChatGPT 网页结构可能会更新。脚本已经尽量用按钮文本、`data-testid` 和 DOM 监听做了兼容；如果以后页面改版导致标记不出现，可以优先检查重试按钮和操作按钮的识别规则。
