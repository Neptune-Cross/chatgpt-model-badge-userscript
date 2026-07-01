# ChatGPT 回复模型标记

这个脚本会在网页版 ChatGPT 的回复结束后，在回复下方操作按钮区域附近自动显示：

```text
已使用 GPT-5.5 Thinking
```

它只是修改你本机浏览器里的页面显示，不会改变实际使用的模型，也不会把信息发送到外部服务。

## 安装方法

1. 浏览器安装 Tampermonkey 或 Violentmonkey。
2. 新建一个用户脚本。
3. 把 `chatgpt-model-badge.user.js` 的内容完整粘贴进去并保存。
4. 刷新 `https://chatgpt.com/`。
5. 等 ChatGPT 回复完成后，操作按钮下方会自动出现模型标记。

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

ChatGPT 网页结构可能会更新。脚本已经尽量用按钮文本、`data-testid` 和 DOM 监听做了兼容；如果以后页面改版导致标记不出现，可以优先检查操作按钮的识别规则。
