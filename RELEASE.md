# 发布新版本

本项目通过 GitHub Actions（`.github/workflows/release.yml`）自动构建并发布。
**只要推送一个 `v*` 标签就会触发**，自动在 Windows + macOS 上各构建一遍并上传到对应 Release。

## 步骤

1. 修改 `client/package.json` 的 `version`（如 `0.1.0` → `0.1.1`）并提交推送：

   ```bash
   cd client
   # 改好 version 后
   git add package.json
   git commit -m "release: v0.1.1"
   git push
   ```

   （CI 也会用标签名自动同步版本号，但本地改好更稳妥。）

2. 打标签并推送标签：

   ```bash
   git tag v0.1.1
   git push origin v0.1.1
   ```

3. 等 Actions 跑完（约 10–20 分钟）。完成后 Release 页会有：

   | 文件 | 说明 |
   | --- | --- |
   | `ZCBidKit-<版本>-win-x64.exe` | Windows 一键安装包（**发给用户/老板用这个**） |
   | `ZCBidKit-<版本>-win-x64.msi` | Windows MSI 安装包（企业批量部署用） |
   | `ZCBidKit-<版本>-win-x64.zip` | Windows 免安装版，解压即用 |
   | `ZCBidKit-<版本>-mac-arm64-package.zip` | macOS（Apple 芯片），内含安装说明 |
   | `ZCBidKit-<版本>-mac-x64-package.zip` | macOS（Intel），内含安装说明 |
   | `latest.yml` / `latest-mac.yml` | 自动更新清单，程序自动读取，**勿手动改/传** |

## 自动更新

已安装的旧版本启动时会读取最新 Release 的 `latest.yml`，发现更高版本即提示升级。
所以**只要版本号比用户已装的高**，推一个新 tag 就能让所有人自动升级。

## 注意

- 只有 `v*` 标签会触发发布；普通 push 到 `main` 不会。
- 不要手动往 Release 传同名文件——CI 会用 `--clobber` 覆盖掉。
- 数据库 / 用户数据不打进安装包，存在用户本机用户目录。
- 本地 `npm run dist:win` 产出的安装包只用于自测，正式分发以 Release（CI 构建）为准。
