---
title: 'chrome 插件的开发记录'
date: 2025-05-29
category: 技术
tags:
  - chrome插件
  - 下载器
description: '一次 chrome 插件的开发记录'
---

# chrome 插件的开发记录

承接之前对 [pget](https://github.com/Code-Hex/pget) 下载器的魔改之后，我需要批量收集网页上的下载链接，手动复制粘贴既耗时又容易遗漏。于是萌生了开发一款 Chrome 插件的想法：在鼠标右键链接时，一键将链接写入本地文件，方便后续统一下载和管理。

## 核心功能与技术选型

1. **Manifest V3 扩展**：
   - 通过 `contextMenus` API 监听链接右键菜单。
   - 使用 Service Worker 处理点击事件。
2. **Native Messaging 本地通信**：
   - 浏览器沙箱无法直接读写本地文件，借助 Native Messaging 机制调用本地程序。
   - 本地程序使用 Go 编写，负责文件创建与追加。

## Chrome 扩展部分

::: details manifest.json 声明

```json
{
  "name": "Link to File Writer",
  "version": "1.0",
  "manifest_version": 3,

  "icons": {
    "16":  "icons/icon16.png",
    "48":  "icons/icon48.png",
    "128": "icons/icon128.png"
  },

  "action": {
    "default_icon": {
      "16":  "icons/icon16.png",
      "48":  "icons/icon48.png",
      "128": "icons/icon128.png"
    },
    "default_title": "收集下载链接"
  },

  "permissions": [
    "contextMenus",
    "nativeMessaging"
  ],

  "background": {
    "service_worker": "background.js"
  }
}
```

:::

::: details background.js 实现

```javascript
// 注册右键菜单（仅在链接上出现）
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "write-link",
        title: "收集下载链接",
        contexts: ["link"]
    });
});

// 点击菜单时触发
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "write-link" && info.linkUrl) {
        console.log("Collected download link: ", info.linkUrl)
        // 向本地 Native Host 发送消息
        chrome.runtime.sendNativeMessage(
            "org.pget.linkwriter",
            {url: info.linkUrl},
            (response) => {
                if (chrome.runtime.lastError) {
                    console.error("Native messaging error: ", chrome.runtime.lastError);
                } else {
                    console.log("Write result: ", response);
                }
            }
        );
    }
});
```

:::

## 本地 Go 程序

`link_writer.go` 负责：

1. 接收带有 4 字节长度前缀的 JSON 消息；
2. 检查并创建路径 `~/download/list/list.txt`；
3. 追加写入链接并换行；
4. 返回成功或失败的 JSON。

::: details go 写入程序

```go
package main

import (
	"encoding/binary"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
)

type Message struct {
	URL string `json:"url"`
}
type Response struct {
	Success bool   `json:"success"`
	Error   string `json:"error,omitempty"`
}

const filePath = "/Users/howardliu/download/list/list.txt"

func main() {
	// —— 1. 读取长度前缀 ——
	lenBuf := make([]byte, 4)
	if _, err := io.ReadFull(os.Stdin, lenBuf); err != nil {
		sendResp(false, "read length: "+err.Error())
		return
	}
	msgLen := binary.LittleEndian.Uint32(lenBuf)

	// —— 2. 读取 JSON 消息 ——
	msgBuf := make([]byte, msgLen)
	if _, err := io.ReadFull(os.Stdin, msgBuf); err != nil {
		sendResp(false, "read message: "+err.Error())
		return
	}

	// —— 3. 解析 URL ——
	var msg Message
	if err := json.Unmarshal(msgBuf, &msg); err != nil {
		sendResp(false, "unmarshal: "+err.Error())
		return
	}

	// —— 4. 确保目录和文件存在，并追加写入 ——
	if err := os.MkdirAll(filepath.Dir(filePath), 0755); err != nil {
		sendResp(false, "mkdir: "+err.Error())
		return
	}
	f, err := os.OpenFile(filePath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
	if err != nil {
		sendResp(false, "open file: "+err.Error())
		return
	}
	defer f.Close()

	// 写入 URL + 换行
	if _, err := f.WriteString(msg.URL + "\n"); err != nil {
		sendResp(false, "write file: "+err.Error())
		return
	}

	// —— 5. 成功返回 ——
	sendResp(true, "")
}

// sendResp 序列化 Response，并加长度前缀写回 stdout
func sendResp(success bool, errMsg string) {
	resp := Response{Success: success, Error: errMsg}
	data, _ := json.Marshal(resp)
	var lenBuf [4]byte
	binary.LittleEndian.PutUint32(lenBuf[:], uint32(len(data)))
	os.Stdout.Write(lenBuf[:])
	os.Stdout.Write(data)
}
```

:::

## Native Messaging Host Manifest

编译完上面的 go 程序后，需要做两件事：

1. 把它放到一个稳定的、不会随意被删除或改名的位置；
2. 然后在 Chrome 能识别的目录下放置 Native Messaging Host 的 manifest 配置文件。下面以 macOS 为例说明：

```shell
$ mkdir -p ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts

$ cd ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts

$ vim org.pget.linkwriter.json // org.pget.linkwriter.json 内容如下
```

```json
{
  "name": "org.pget.linkwriter",
  "description": "Append link URLs to list.txt",
  "path": "~/software/chrome/link_write_ext/link_write",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://<YOUR_EXTENSION_ID>/"
  ]
}
```

- **`name`**：用于 `chrome.runtime.sendNativeMessage("com.howardliu.linkwriter", …)`
- **`path`**：指向你放置的可执行文件的绝对路径
- **`type`**：必须是 `"stdio"`
- **`allowed_origins`**：列出允许调用此 Host 的扩展 ID（在 `chrome://extensions` 拿到）

这样一来 chrome 扩展插件就可以通过本地的 go 小程序进行文件写入。

## 调试与排查

Manifest V3 的后台脚本是以 Service Worker 形式存在的，不是传统的持久化 Background Page。它会在没事时被“闲置”挂起，代码的 `console.log` 只会出现在它活跃的那一刻。

1. 在 `chrome://extensions/` 找到你的扩展，点击 **“背景页 (service worker)”** 旁的 **“Inspect views: service worker”** 链接。
2. 会弹出一个 DevTools 窗口，切到 **Console** 面板。
3. 手动点击右上角的 **“Activate”**（或在页面里执行 `self.registration.update()`），让 Service Worker 唤醒，再操作右键菜单，再查看日志打印。
