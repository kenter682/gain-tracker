# Gain Tracker

Cloudflare Workers + Static Assets (React / Vite / MUI + Hono + D1 + R2) で構成されたアプリケーションです。

## ディレクトリ構成

- `frontend/`: React + Vite + TypeScript フロントエンド
- `backend/`: Hono + Cloudflare Workers バックエンド（`[assets]` で `../frontend/dist` を配信）

## ローカル開発

1. 依存関係のインストール:
   ```bash
   npm install
   ```
2. 環境変数ファイルの作成:
   `backend/.dev.vars.example` を `backend/.dev.vars` にコピーし、必要な API キーを設定します。
3. 開発サーバーの起動:
   ```bash
   npm run dev:backend
   npm run dev:frontend
   ```

## Cloudflare Workers Builds（Git 連携・自動デプロイ）設定

Cloudflare ダッシュボードで本リポジトリを連携する際の設定値:

- **Root directory**: `/`（空欄またはデフォルト）
- **Build command**: `npm run build`
- **Deploy command**: `npm run deploy`
- **Production branch**: `main`

### 本番環境の Secrets 設定

Cloudflare ダッシュボード（Worker の Settings → Variables and Secrets）または CLI から以下を設定してください:

- `GEMINI_API_KEY`
- `OPENROUTER_API_KEY`
- `AUTH_TOKEN`
