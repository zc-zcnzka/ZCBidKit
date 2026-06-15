# ZC投标工具箱 - AI 智能标书写作助手

面向招投标场景的桌面端智能标书制作工具：AI 生成技术方案、图文混排、企业知识库管理、标书查重、废标项检查等。Windows / macOS 客户端，数据保存在本机，填入自己的 AI API Key 即可使用。

## 下载安装

前往 [Releases](https://github.com/zc-zcnzka/ZCBidKit/releases/latest) 下载对应安装包：

| 平台 | 文件 | 说明 |
| --- | --- | --- |
| Windows | `ZCBidKit-<版本>-win-x64.exe` | 一键安装，**首选** |
| Windows | `ZCBidKit-<版本>-win-x64.zip` | 免安装绿色版，解压即用 |
| macOS（Apple 芯片） | `ZCBidKit-<版本>-mac-arm64-package.zip` | 内含安装说明 |
| macOS（Intel） | `ZCBidKit-<版本>-mac-x64-package.zip` | 内含安装说明 |

首次使用，在「设置」中填入自己的 AI API Key（支持 DeepSeek、火山方舟、OpenAI 兼容接口，以及 ollama / lm studio 本地模型）。应用会在有新版本时自动提示更新。

## 开发

源码位于 `client/` 目录：

```bash
cd client
npm install
npm run dev        # 本地开发
npm run dist:win   # 打包 Windows 安装包
```

发布新版本的流程见 [RELEASE.md](./RELEASE.md)。

## 致谢与开源许可

本项目基于开源项目 **[OpenBidKit / 易标投标工具箱](https://github.com/FB208/OpenBidKit_Yibiao)** 二次开发，在其基础上做了品牌、自动更新指向、打包配置等定制化改造。

遵循 **AGPL-3.0** 开源协议，源码同样以 AGPL-3.0 协议开放。感谢原作者的工作。
