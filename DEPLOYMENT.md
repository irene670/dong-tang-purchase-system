# 部署與開發指南 (Deployment & Development Guide)

本專案已從 Netlify 遷移至 Google Cloud Platform (GCP) 上的獨立虛擬機，並採用 Docker Compose 搭配 Caddy 與 PostgreSQL 進行部署。

以下文件說明目前的系統架構、如何進行本地開發、以及如何將新程式碼更新到正式主機。

## 🌐 系統架構與主機資訊

* **正式網域**: [https://pur.eavo.com.tw](https://pur.eavo.com.tw)
* **雲端供應商**: Google Cloud Platform (GCP)
* **GCP 專案**: `spheric-mesh-281815`
* **主機 IP**: `136.115.165.253`
* **主機規格**: e2-micro (永久免費層級), 30GB Disk, us-central1-a
* **作業系統**: Ubuntu 22.04 LTS
* **前端框架**: React + Vite
* **後端伺服器**: Node.js (Express) - 位於 `server/server.mjs`
* **資料庫**: PostgreSQL 15
* **反向代理與 SSL**: Caddy 2 (自動核發與更新 Let's Encrypt 憑證)

---

## 💻 本地開發環境 (Local Development)

### 前置作業
1. 安裝 [Node.js](https://nodejs.org/) (建議 v20 以上)
2. 安裝 [Docker Desktop](https://www.docker.com/products/docker-desktop)

### 啟動本地環境
專案使用 Docker Compose 管理本地的資料庫。

1. **啟動本地資料庫**:
   ```bash
   docker compose up -d db
   ```
   *(這會啟動 PostgreSQL 並綁定在本機 5432 port)*

2. **安裝依賴**:
   ```bash
   npm install
   ```

3. **啟動前端與後端開發伺服器**:
   開啟兩個終端機視窗：
   * **前端**: 
     ```bash
     npm run dev
     ```
   * **後端 API**: 
     ```bash
     node server/server.mjs
     ```

### 資料庫初始化與 Migrations
後端伺服器 (`server/server.mjs`) 啟動時，會自動呼叫 `runMigrations()` 檢查 `netlify/database/migrations` 內的 SQL 腳本並執行。
預設的管理者帳號密碼為 `admin@eavo.com.tw` / `admin123456`。

---

## 🚀 正式機更新與部署流程 (Deployment)

目前採取直接封裝原始碼並上傳至 GCP VM 進行建置的方式 (Build on VM)。

### 方法一：使用 gcloud 指令 (推薦)
如果您已安裝 Google Cloud CLI (`gcloud`) 並且有帳號權限，可使用此腳本：

1. **打包最新專案檔案**:
   ```powershell
   Compress-Archive -Path Dockerfile,docker-compose.yml,package.json,package-lock.json,server,src,public,index.html,shared,netlify,Caddyfile -DestinationPath deploy.zip -Force
   ```
   *(請確保包含所有需要的資料夾)*

2. **上傳至 GCP VM**:
   ```bash
   gcloud compute scp deploy.zip free-vm:~/deploy.zip --project=spheric-mesh-281815 --zone=us-central1-a
   ```

3. **在 VM 上解壓縮並重新建置容器**:
   ```bash
   gcloud compute ssh free-vm --project=spheric-mesh-281815 --zone=us-central1-a --command="cd ~/dong-tang-purchase-system && unzip -o ~/deploy.zip && rm ~/deploy.zip && sudo docker compose up -d --build"
   ```

### 方法二：透過 SSH 手動更新
1. 透過 `gcloud compute ssh free-vm ...` 或是配置好的 SSH Key 連線進主機 `136.115.165.253`。
2. 切換到專案目錄：`cd ~/dong-tang-purchase-system`
3. 透過 `git pull` (若主機有綁定 Git) 或是 SFTP 將新檔案覆蓋。
4. 重建並重啟服務：
   ```bash
   sudo docker compose up -d --build
   ```

---

## 🐳 Docker 服務配置說明 (`docker-compose.yml`)

系統由三個容器組成：
1. **caddy**: 負責接收 Port 80 與 443 的請求，自動處理 Let's Encrypt SSL 憑證，並將請求 Reverse Proxy 給 app 容器。
2. **app**: Node.js 伺服器，將前端 (Vite build dist) 與後端 API (Express) 封裝在同一個容器內。Port 8080 僅供內部網路存取。
3. **db**: PostgreSQL 15，資料掛載於 Docker Volume `pgdata` 中以實現持久化。

---

## 🛠️ 常見問題排解 (Troubleshooting)

* **看伺服器 Log**: 
  ```bash
  sudo docker logs dong-tang-purchase-system-app-1 --tail=100 -f
  ```
* **看憑證/Caddy Log**: 
  ```bash
  sudo docker logs dong-tang-purchase-system-caddy-1 --tail=100 -f
  ```
* **進入資料庫**: 
  ```bash
  sudo docker exec -it dong-tang-purchase-system-db-1 psql -U postgres -d postgres
  ```
* **如果資料庫毀損想重置**: 
  ```bash
  sudo docker compose down -v
  ```
  *(注意：這會清空 `pgdata` Volume，導致所有資料遺失，請謹慎使用)*
