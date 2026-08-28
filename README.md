# AI Note

每日 GitHub AI 项目雷达。网站采用纯 HTML、CSS、JavaScript 和 JSON，不需要 Node.js 或数据库，可直接由 Nginx 托管。

## 功能

- 项目全文搜索与分类筛选
- 按今日增星、总 Star、上手成本和名称排序
- 浏览器本地收藏
- 最多 3 个项目并排对比
- 每日学习路线与动手任务
- 明暗主题与移动端布局

## 目录

```text
site/                    # Nginx 直接发布的静态网站
  index.html
  assets/
  data/projects.json     # 当前项目快照
data/daily/              # 每日 Markdown 日报归档
deploy-centos7/          # CentOS 7 拉取与部署脚本
```

## 本地预览

```bash
python3 -m http.server 8000 --directory site
```

浏览器打开 `http://127.0.0.1:8000`。

## CentOS 7 部署

参见 [`deploy-centos7/README.md`](deploy-centos7/README.md)。Nginx 默认监听 8088；服务器每 5 分钟检查 `main`，将 `site/` 原子切换到网站目录，失败时保留旧版本。

## 数据约定

`site/data/projects.json` 是网页读取的当前快照。每日任务更新此文件，并在 `data/daily/YYYY-MM-DD.md` 保存可审计日报。
