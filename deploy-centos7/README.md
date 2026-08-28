# CentOS 7.9 / 阿里云 ECS 静态发布

这套配置专门对应：

- CentOS Linux 7.9.2009
- x86_64
- GitHub 公有仓库 `changeme2012/ai-note`
- Nginx 静态网站

服务器只拉取并发布仓库 `site/` 目录，不安装 Node.js，也不在服务器上编译。

## 重要说明

CentOS 7 已停止安全维护。此方案用于降低现有旧服务器的部署风险，不代表操作系统本身适合长期暴露在公网。建议安排迁移到 Alibaba Cloud Linux 3、Rocky Linux 9、AlmaLinux 9 或其他受支持系统。

## 仓库约定

每次提交必须包含可直接访问的静态文件：

```text
site/
├── index.html
├── assets/
└── data/
```

如果网站源代码使用 Astro/Vite，应在 GitHub Actions 或开发电脑上完成构建，再把构建结果同步到 `site/`；不要在 CentOS 7 上运行 Node 构建。

## 1. 检查已有软件

```bash
git --version
nginx -v
flock --version
getenforce
```

如果某个命令不存在，安装对应软件。CentOS 7 官方软件源已归档，现有服务器的 yum 源配置可能需要由服务器管理员先修复：

```bash
sudo yum install -y git nginx cronie util-linux tar policycoreutils-python
```

## 2. 上传并安装脚本

先将本目录中的文件放到服务器临时目录，例如 `/root/ai-note-deploy/`，然后执行：

```bash
sudo install -m 0755 /root/ai-note-deploy/deploy.sh /usr/local/sbin/ai-note-deploy
sudo install -m 0644 /root/ai-note-deploy/ai-note.cron /etc/cron.d/ai-note
sudo install -m 0644 /root/ai-note-deploy/nginx.conf /etc/nginx/conf.d/ai-note.conf
```

## 3. 配置 SELinux

```bash
sudo mkdir -p /opt/ai-note/releases
sudo semanage fcontext -a -t httpd_sys_content_t '/opt/ai-note(/.*)?' 2>/dev/null \
  || sudo semanage fcontext -m -t httpd_sys_content_t '/opt/ai-note(/.*)?'
sudo restorecon -RFv /opt/ai-note
```

不要永久关闭 SELinux。

## 4. 首次发布

确保 GitHub 仓库中已经存在 `site/index.html`，然后执行：

```bash
sudo /usr/local/sbin/ai-note-deploy
readlink -f /opt/ai-note/current
```

首次发布成功后再启用服务：

```bash
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl restart nginx
sudo systemctl enable crond
sudo systemctl restart crond
```

如果 `/etc/nginx/nginx.conf` 中已经有另一个 `default_server`，请删除本配置两行中的 `default_server`，然后重新执行 `sudo nginx -t`。

## 5. 网络入口

如果服务器启用了 firewalld：

```bash
if sudo systemctl is-active --quiet firewalld; then
  sudo firewall-cmd --permanent --add-service=http
  sudo firewall-cmd --permanent --add-service=https
  sudo firewall-cmd --reload
fi
```

还需在阿里云 ECS 安全组中放行 TCP 80；配置 HTTPS 后再放行 TCP 443。

## 6. 查看运行状态

```bash
sudo tail -f /var/log/ai-note-deploy.log
sudo /usr/local/sbin/ai-note-deploy
sudo nginx -t
sudo systemctl status nginx crond --no-pager
```

如果日志显示 `site/index.html does not exist`，说明网站静态文件尚未提交，或目录名不同。目录不同时修改 `/etc/cron.d/ai-note` 中的 `STATIC_DIR`。

## 7. 回滚

```bash
sudo ls -1dt /opt/ai-note/releases/*
sudo ln -s /opt/ai-note/releases/目标版本/site /opt/ai-note/current.rollback
sudo mv -Tf /opt/ai-note/current.rollback /opt/ai-note/current
```

